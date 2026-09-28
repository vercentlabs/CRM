import type { Queryable } from '@crm/database';
import type { Tenant } from '../../platform/tenancy.js';

/**
 * Organization settings (one key/value namespace per organization).
 * Platform configuration (SMTP, secrets, provider keys) lives in environment
 * variables and is never stored or editable here.
 */

export async function read(db: Queryable, tenant: Tenant): Promise<Record<string, string>> {
  const result = await db.query(
    'SELECT key, value FROM settings WHERE organization_id = $1 ORDER BY key',
    [tenant.organizationId],
  );
  return Object.fromEntries(
    result.rows.map((row: { key: string; value: string }) => [row.key, row.value]),
  );
}

export async function upsert(
  db: Queryable,
  tenant: Tenant,
  key: string,
  value: string,
): Promise<void> {
  await db.query(
    `INSERT INTO settings (organization_id, key, value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [tenant.organizationId, key, value],
  );
}
