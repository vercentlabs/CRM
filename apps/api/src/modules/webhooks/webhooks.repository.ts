import type { Queryable } from '@crm/database';
import type { Tenant } from '../../platform/tenancy.js';

export interface WebhookEndpointRow {
  id: number;
  public_id: string;
  url: string;
  description: string | null;
  event_types: string[];
  active: boolean;
  created_at: Date;
  updated_at: Date;
  last_status: string | null;
  last_at: Date | null;
}

/** Never selects secret_ciphertext: the secret is only returned once, at creation/rotation. */
const COLUMNS = `e.id, e.public_id, e.url, e.description, e.event_types, e.active, e.created_at, e.updated_at,
  d.status AS last_status, d.updated_at AS last_at`;
const LAST_DELIVERY = `LEFT JOIN LATERAL (
    SELECT status, updated_at FROM webhook_deliveries
    WHERE endpoint_id = e.id AND organization_id = e.organization_id
    ORDER BY created_at DESC LIMIT 1
  ) d ON true`;

export async function list(db: Queryable, tenant: Tenant): Promise<WebhookEndpointRow[]> {
  const result = await db.query(
    `SELECT ${COLUMNS} FROM webhook_endpoints e ${LAST_DELIVERY}
     WHERE e.organization_id = $1 ORDER BY e.created_at, e.id`,
    [tenant.organizationId],
  );
  return result.rows;
}

export async function find(
  db: Queryable,
  tenant: Tenant,
  publicId: string,
): Promise<WebhookEndpointRow | null> {
  const result = await db.query(
    `SELECT ${COLUMNS} FROM webhook_endpoints e ${LAST_DELIVERY}
     WHERE e.organization_id = $1 AND e.public_id = $2`,
    [tenant.organizationId, publicId],
  );
  return result.rows[0] ?? null;
}

export async function count(db: Queryable, tenant: Tenant): Promise<number> {
  const result = await db.query(
    'SELECT count(*)::int AS n FROM webhook_endpoints WHERE organization_id = $1',
    [tenant.organizationId],
  );
  return result.rows[0].n;
}

export async function insert(
  db: Queryable,
  tenant: Tenant,
  input: {
    url: string;
    description: string | null;
    events: string[];
    secretCiphertext: string;
    createdBy: number;
  },
): Promise<string> {
  const result = await db.query(
    `INSERT INTO webhook_endpoints (organization_id, url, description, event_types, secret_ciphertext, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING public_id`,
    [
      tenant.organizationId,
      input.url,
      input.description,
      input.events,
      input.secretCiphertext,
      input.createdBy,
    ],
  );
  return result.rows[0].public_id;
}

export async function update(
  db: Queryable,
  tenant: Tenant,
  publicId: string,
  changes: {
    url?: string | undefined;
    description?: string | null | undefined;
    events?: string[] | undefined;
    active?: boolean | undefined;
    secretCiphertext?: string | undefined;
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE webhook_endpoints SET
       url = COALESCE($3, url),
       description = CASE WHEN $4::boolean THEN $5 ELSE description END,
       event_types = COALESCE($6, event_types),
       active = COALESCE($7, active),
       secret_ciphertext = COALESCE($8, secret_ciphertext),
       updated_at = now()
     WHERE organization_id = $1 AND public_id = $2`,
    [
      tenant.organizationId,
      publicId,
      changes.url ?? null,
      changes.description !== undefined,
      changes.description ?? null,
      changes.events ?? null,
      changes.active ?? null,
      changes.secretCiphertext ?? null,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Deliveries cascade; a queued delivery job for a removed endpoint becomes a no-op. */
export async function remove(db: Queryable, tenant: Tenant, publicId: string): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM webhook_endpoints WHERE organization_id = $1 AND public_id = $2',
    [tenant.organizationId, publicId],
  );
  return (result.rowCount ?? 0) > 0;
}
