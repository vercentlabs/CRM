import { withTransaction } from '@crm/database';
import email from '../../integrations/email.js';
import { recordAuditEvent } from '../../platform/audit.js';
import { pool } from '../../platform/db.js';
import type { Actor } from '../../platform/tenancy.js';
import * as settings from './settings.repository.js';

export const getSettings = (actor: Actor) => settings.read(pool, actor);

/** All keys are written atomically; values are stored JSON-encoded (historical format). */
export async function updateSettings(
  actor: Actor,
  values: Record<string, unknown>,
): Promise<Record<string, string>> {
  const entries = Object.entries(values);
  await withTransaction(pool, async (client) => {
    for (const [key, value] of entries)
      await settings.upsert(client, actor, key, JSON.stringify(value));
  });
  await recordAuditEvent({
    action: 'UPDATE_SETTINGS',
    tableName: 'settings',
    recordId: null,
    newValues: { keys: entries.map(([key]) => key) },
  });
  return settings.read(pool, actor);
}

/** SMTP diagnostics for organization administrators: outcome only, never error details. */
export const verifyEmailConfiguration = () => email.verifyEmailConfig();

export const sendTestEmail = (actor: Actor, to: string | undefined) =>
  email.sendTestEmail(to ?? actor.email);
