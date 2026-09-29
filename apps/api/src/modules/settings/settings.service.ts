import { withTransaction } from '@crm/database';
import { isValidTimeZone } from '@crm/validation';
import { AppError } from '../../platform/http/errors.js';
import { emailSender } from '../../platform/providers.js';
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
  if ('timezone' in values && !isValidTimeZone(values.timezone)) {
    throw AppError.validation([
      { field: 'timezone', message: 'Time zone must be an IANA name such as Asia/Kolkata' },
    ]);
  }
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
export const verifyEmailConfiguration = () => emailSender.verify();

export const sendTestEmail = (actor: Actor, to: string | undefined): Promise<boolean> =>
  emailSender
    .send({
      to: to ?? actor.email,
      subject: 'Test Email',
      text: 'This is a test email from the CRM system. If you receive it, email delivery works.',
      html: '<p>This is a test email from the CRM system.</p><p>If you receive it, email delivery works.</p>',
    })
    .then(() => true)
    .catch(() => false);
