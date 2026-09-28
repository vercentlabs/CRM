import type { Queryable } from '@crm/database';
import type { Call } from '@crm/types';
import type { Tenant } from '../../platform/tenancy.js';

/** CRM call records. OWN scope = user_id (the member who placed the call). */

const SELECT = `
  SELECT c.id, c.lead_id, c.user_id, c.call_status, c.start_time, c.end_time, c.duration_seconds, c.notes,
         c.outcome, c.plivo_call_uuid, c.recording_url, c.recording_id, c.created_at, c.updated_at,
         l.full_name AS lead_name
  FROM calls c
  JOIN leads l ON l.id = c.lead_id AND l.organization_id = c.organization_id`;

export async function list(
  db: Queryable,
  tenant: Tenant,
  ownerId: number | null,
  paging: { limit: number; offset: number } | 'all',
): Promise<{ rows: Call[]; total: number }> {
  const params: unknown[] = [tenant.organizationId];
  let where = 'WHERE c.organization_id = $1';
  if (ownerId !== null) {
    params.push(ownerId);
    where += ` AND c.user_id = $${params.length}`;
  }
  const limitSql =
    paging === 'all' ? '' : `LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const [rows, count] = await Promise.all([
    db.query(`${SELECT} ${where} ORDER BY c.start_time DESC, c.id DESC ${limitSql}`, [
      ...params,
      ...(paging === 'all' ? [] : [paging.limit, paging.offset]),
    ]),
    db.query(`SELECT COUNT(*) AS count FROM calls c ${where}`, params),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].count) };
}

export async function findById(db: Queryable, tenant: Tenant, id: number): Promise<Call | null> {
  const result = await db.query(`${SELECT} WHERE c.id = $1 AND c.organization_id = $2`, [
    id,
    tenant.organizationId,
  ]);
  return result.rows[0] ?? null;
}

export async function lockById(db: Queryable, tenant: Tenant, id: number) {
  const result = await db.query(
    'SELECT id, user_id FROM calls WHERE id = $1 AND organization_id = $2 FOR UPDATE',
    [id, tenant.organizationId],
  );
  return (result.rows[0] as { id: number; user_id: number } | undefined) ?? null;
}

export async function insertScheduled(
  db: Queryable,
  tenant: Tenant,
  leadId: number,
  userId: number,
): Promise<number> {
  const result = await db.query(
    `INSERT INTO calls (organization_id, lead_id, user_id, call_status, start_time)
     VALUES ($1, $2, $3, 'Scheduled', NOW()) RETURNING id`,
    [tenant.organizationId, leadId, userId],
  );
  return result.rows[0].id;
}

export async function setProviderCallId(
  db: Queryable,
  tenant: Tenant,
  id: number,
  providerCallId: string,
): Promise<void> {
  await db.query('UPDATE calls SET plivo_call_uuid = $1 WHERE id = $2 AND organization_id = $3', [
    providerCallId,
    id,
    tenant.organizationId,
  ]);
}

export async function markCancelled(db: Queryable, tenant: Tenant, id: number): Promise<void> {
  await db.query(
    `UPDATE calls SET call_status = 'Cancelled', end_time = NOW() WHERE id = $1 AND organization_id = $2`,
    [id, tenant.organizationId],
  );
}

export async function end(
  db: Queryable,
  tenant: Tenant,
  id: number,
  data: {
    duration_seconds?: number | undefined;
    call_status: string;
    recording_url?: string | undefined;
  },
): Promise<string[]> {
  const sets = ['call_status = $1', 'end_time = NOW()'];
  const values: unknown[] = [data.call_status];
  const fields = ['call_status', 'end_time'];
  if (data.duration_seconds !== undefined) {
    values.push(data.duration_seconds);
    sets.push(`duration_seconds = $${values.length}`);
    fields.unshift('duration_seconds');
  }
  if (data.recording_url !== undefined) {
    values.push(data.recording_url);
    sets.push(`recording_url = $${values.length}`);
    fields.push('recording_url');
  }
  values.push(id, tenant.organizationId);
  await db.query(
    `UPDATE calls SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND organization_id = $${values.length}`,
    values,
  );
  return fields;
}

/**
 * SYSTEM CONTEXT (signed provider webhooks only): the call row is located by
 * the provider's unguessable call UUID, so the tenant is derived from that row.
 * Never expose this to user-driven endpoints.
 */
export async function updateByProviderCallId(
  db: Queryable,
  providerCallId: string,
  patch: {
    call_status?: string | undefined;
    duration_seconds?: number | undefined;
    recording_url?: string | undefined;
    recording_id?: string | undefined;
    start_time_now?: boolean;
    end_time_now?: boolean;
  },
): Promise<number> {
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.call_status !== undefined) set('call_status', patch.call_status);
  if (patch.duration_seconds !== undefined) set('duration_seconds', patch.duration_seconds);
  if (patch.recording_url !== undefined) set('recording_url', patch.recording_url);
  if (patch.recording_id !== undefined) set('recording_id', patch.recording_id);
  if (patch.start_time_now) sets.push('start_time = NOW()');
  if (patch.end_time_now) sets.push('end_time = NOW()');
  values.push(providerCallId);
  const result = await db.query(
    `UPDATE calls SET ${sets.join(', ')} WHERE plivo_call_uuid = $${values.length}`,
    values,
  );
  return result.rowCount ?? 0;
}
