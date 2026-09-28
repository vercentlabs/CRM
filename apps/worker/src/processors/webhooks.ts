import {
  DELIVERY_HEADER,
  EVENT_ID_HEADER,
  EVENT_TYPE_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  assertSafeWebhookTarget,
  decryptSecret,
  isPermanentStatus,
  signPayload,
} from '@crm/integrations';
import { withTransaction } from '@crm/database';
import * as store from '../db/files-webhooks.js';
import { loadEvent } from '../db/outbox.js';
import type { JobContext, WorkerDeps } from '../jobs/context.js';
import { jobId, type JobPayload } from '../jobs/definitions.js';
import { PermanentJobError } from '../queue/types.js';

/** Creates one delivery per subscribed endpoint and queues it (idempotent by (endpoint, event)). */
export async function fanOut(deps: WorkerDeps, job: JobPayload<'webhook.fanout'>) {
  const event = await loadEvent(deps.db, job.organizationId, job.eventId);
  if (!event) return;
  for (const endpoint of await store.subscribedEndpoints(deps.db, job.organizationId, event.type)) {
    const deliveryId = await store.ensureDelivery(deps.db, job.organizationId, endpoint.id, event);
    await deps.queue.enqueue({
      name: 'webhook.deliver',
      payload: { organizationId: job.organizationId, deliveryId },
      id: jobId('webhook.deliver', deliveryId),
    });
  }
}

/**
 * Signed delivery. Body: event envelope with the organization's PUBLIC id;
 * headers: HMAC-SHA256 signature over "<timestamp>.<body>", timestamp,
 * delivery id, event id/type. Redirects are not followed and every attempt
 * re-checks the target (HTTPS + public addresses in production). Secrets and
 * payloads are never logged.
 */
export async function deliver(
  deps: WorkerDeps,
  job: JobPayload<'webhook.deliver'>,
  ctx: JobContext,
) {
  const { organizationId, deliveryId } = job;
  const target = await withTransaction(deps.db, async (tx) => {
    const delivery = await store.lockDelivery(tx, organizationId, deliveryId);
    if (!delivery || ['delivered', 'failed', 'cancelled'].includes(delivery.status)) return null;
    if (!delivery.endpoint_active) {
      await store.setDelivery(tx, organizationId, deliveryId, {
        status: 'cancelled',
        error: 'Endpoint disabled',
      });
      return null;
    }
    await store.setDelivery(tx, organizationId, deliveryId, { status: 'delivering' });
    return delivery;
  });
  if (!target) return;

  const fail = async (
    code: string,
    message: string,
    permanent: boolean,
    responseStatus?: number,
  ) => {
    const terminal = permanent || ctx.finalAttempt;
    await store.setDelivery(deps.db, organizationId, deliveryId, {
      status: terminal ? 'failed' : 'pending',
      responseStatus: responseStatus ?? null,
      error: `${code}: ${message}`,
    });
    if (permanent) throw new PermanentJobError(message, code);
    throw new Error(`${code}: ${message}`);
  };

  const event = await loadEvent(deps.db, organizationId, target.event_id);
  if (!event) return fail('EVENT_MISSING', 'The event is no longer available', true);
  if (!deps.config.webhookSecretKey)
    return fail('SIGNING_KEY_MISSING', 'WEBHOOK_SECRET_KEY is not configured', true);

  let url: URL;
  try {
    url = await assertSafeWebhookTarget(target.url, {
      allowPrivate: deps.config.allowPrivateWebhookTargets,
      resolver: deps.config.resolver,
    });
  } catch (error) {
    return fail('TARGET_NOT_ALLOWED', (error as Error).message, true);
  }

  let secret: string;
  try {
    secret = decryptSecret(deps.config.webhookSecretKey, target.secret_ciphertext);
  } catch {
    return fail('SECRET_UNREADABLE', 'The endpoint secret cannot be decrypted', true);
  }

  const body = JSON.stringify({
    id: event.id,
    type: event.type,
    version: event.version,
    occurredAt: event.occurredAt,
    organizationId: target.organization_public_id,
    deliveryId: target.public_id,
    data: event.payload,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  let response: Response;
  try {
    response = await deps.config.fetch(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(deps.config.webhookTimeoutMs),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'CRM-Webhooks/1',
        [SIGNATURE_HEADER]: signPayload(secret, timestamp, body),
        [TIMESTAMP_HEADER]: String(timestamp),
        [DELIVERY_HEADER]: target.public_id,
        [EVENT_ID_HEADER]: event.id,
        [EVENT_TYPE_HEADER]: event.type,
      },
      body,
    });
  } catch (error) {
    const timeout = (error as Error).name === 'TimeoutError';
    return fail(
      timeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      timeout ? 'Endpoint timed out' : 'Endpoint unreachable',
      false,
    );
  }
  if (response.status >= 200 && response.status < 300) {
    await store.setDelivery(deps.db, organizationId, deliveryId, {
      status: 'delivered',
      responseStatus: response.status,
      error: null,
    });
    return;
  }
  return fail(
    'HTTP_STATUS',
    `Endpoint answered ${response.status}`,
    isPermanentStatus(response.status),
    response.status,
  );
}
