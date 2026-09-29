import { randomBytes } from 'node:crypto';
import { WEBHOOK_EVENT_TYPES } from '@crm/events';
import {
  assertSafeWebhookTarget,
  encryptSecret,
  parseSecretKey,
  type Resolver,
} from '@crm/integrations';
import { recordAuditEvent } from '../../platform/audit.js';
import { pool } from '../../platform/db.js';
import { env } from '../../platform/env.js';
import { AppError } from '../../platform/http/errors.js';
import type { Actor } from '../../platform/tenancy.js';
import * as repo from './webhooks.repository.js';

/**
 * Outbound webhook management (settings.integrations.manage). Signing secrets
 * are generated server-side, returned exactly once (create / rotate), stored
 * encrypted with WEBHOOK_SECRET_KEY (AES-256-GCM) and never read back through
 * the API, logs or audit rows. Targets must be HTTPS and resolve to public
 * addresses (re-checked by the worker before every delivery).
 */

export const MAX_ENDPOINTS_PER_ORGANIZATION = 10;

let resolver: Resolver | undefined;
/** Test hook: deterministic DNS for target validation. */
export function useWebhookResolver(next: Resolver | undefined): void {
  resolver = next;
}

let cachedKey: Buffer | null | undefined;
function secretKey(): Buffer {
  if (cachedKey === undefined) {
    cachedKey = env.WEBHOOK_SECRET_KEY ? parseSecretKey(env.WEBHOOK_SECRET_KEY) : null;
  }
  if (!cachedKey) throw AppError.serviceUnavailable('Webhook management is not configured');
  return cachedKey;
}

const newSecret = () => `whsec_${randomBytes(32).toString('base64url')}`;

async function validateTarget(url: string): Promise<string> {
  try {
    const parsed = await assertSafeWebhookTarget(url, {
      allowPrivate: env.WEBHOOK_ALLOW_PRIVATE_TARGETS === true,
      ...(resolver ? { resolver } : {}),
    });
    return parsed.toString();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid webhook URL';
    // DNS failures are reported like private targets: no resolver details leak.
    throw AppError.validation([
      {
        field: 'url',
        message: /private|HTTPS|credentials|scheme|Invalid/.test(message)
          ? message
          : 'Webhook target must resolve to a public address',
      },
    ]);
  }
}

const allowedEvents = new Set<string>(WEBHOOK_EVENT_TYPES);
function validateEvents(events: string[]): string[] {
  const unique = [...new Set(events)];
  const unknown = unique.filter((e) => !allowedEvents.has(e));
  if (unique.length === 0 || unknown.length > 0) {
    throw AppError.validation([
      { field: 'events', message: `Unsupported event types: ${unknown.join(', ') || '(none)'}` },
    ]);
  }
  return unique.sort();
}

export interface WebhookEndpointView {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastDelivery: { status: string; at: string } | null;
}

const view = (row: repo.WebhookEndpointRow): WebhookEndpointView => ({
  id: row.public_id,
  url: row.url,
  description: row.description,
  events: row.event_types,
  active: row.active,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  lastDelivery:
    row.last_status && row.last_at
      ? { status: row.last_status, at: row.last_at.toISOString() }
      : null,
});

async function load(actor: Actor, id: string) {
  const row = await repo.find(pool, actor, id);
  if (!row) throw AppError.notFound('Webhook endpoint not found');
  return view(row);
}

export const eventTypes = (): string[] => [...WEBHOOK_EVENT_TYPES];

export async function list(actor: Actor): Promise<WebhookEndpointView[]> {
  return (await repo.list(pool, actor)).map(view);
}

export async function create(
  actor: Actor,
  input: { url: string; description?: string | undefined; events: string[] },
): Promise<{ endpoint: WebhookEndpointView; secret: string }> {
  const key = secretKey();
  const url = await validateTarget(input.url);
  const events = validateEvents(input.events);
  if ((await repo.count(pool, actor)) >= MAX_ENDPOINTS_PER_ORGANIZATION) {
    throw AppError.conflict(
      `An organization can have at most ${MAX_ENDPOINTS_PER_ORGANIZATION} webhook endpoints`,
    );
  }
  const secret = newSecret();
  const id = await repo.insert(pool, actor, {
    url,
    description: input.description?.trim() || null,
    events,
    secretCiphertext: encryptSecret(key, secret),
    createdBy: actor.userId,
  });
  await recordAuditEvent({
    action: 'WEBHOOK_CREATED',
    tableName: 'webhook_endpoints',
    newValues: { id, url, events },
  });
  return { endpoint: await load(actor, id), secret };
}

export async function update(
  actor: Actor,
  id: string,
  input: {
    url?: string | undefined;
    description?: string | null | undefined;
    events?: string[] | undefined;
    active?: boolean | undefined;
  },
): Promise<WebhookEndpointView> {
  const before = await load(actor, id);
  const changes = {
    url: input.url === undefined ? undefined : await validateTarget(input.url),
    description: input.description === undefined ? undefined : input.description?.trim() || null,
    events: input.events === undefined ? undefined : validateEvents(input.events),
    active: input.active,
  };
  await repo.update(pool, actor, id, changes);
  const after = await load(actor, id);
  await recordAuditEvent({
    action: 'WEBHOOK_UPDATED',
    tableName: 'webhook_endpoints',
    oldValues: { id, url: before.url, events: before.events, active: before.active },
    newValues: { id, url: after.url, events: after.events, active: after.active },
  });
  return after;
}

export async function rotateSecret(
  actor: Actor,
  id: string,
): Promise<{ endpoint: WebhookEndpointView; secret: string }> {
  const key = secretKey();
  await load(actor, id);
  const secret = newSecret();
  await repo.update(pool, actor, id, { secretCiphertext: encryptSecret(key, secret) });
  await recordAuditEvent({
    action: 'WEBHOOK_SECRET_ROTATED',
    tableName: 'webhook_endpoints',
    newValues: { id },
  });
  return { endpoint: await load(actor, id), secret };
}

export async function remove(actor: Actor, id: string): Promise<void> {
  const before = await load(actor, id);
  await repo.remove(pool, actor, id);
  await recordAuditEvent({
    action: 'WEBHOOK_DELETED',
    tableName: 'webhook_endpoints',
    oldValues: { id, url: before.url },
  });
}
