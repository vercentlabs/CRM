import type { Queryable } from '@crm/database';
import type { LeadMessage } from '@crm/types';
import type { Tenant } from '../../platform/tenancy.js';

/**
 * Lead messages (SMS / WhatsApp records sent to leads). OWN scope = user_id.
 * Not to be confused with internal team chat (modules/chat).
 */

const SELECT = `
  SELECT m.id, m.lead_id, m.user_id, m.message_type, m.subject, m.content, m.status, m.sent_at, m.created_at,
         l.full_name AS lead_name
  FROM messages m
  JOIN leads l ON l.id = m.lead_id AND l.organization_id = m.organization_id`;

export async function list(
  db: Queryable,
  tenant: Tenant,
  filter: { ownerId: number | null; leadId?: number | undefined },
  paging: { limit: number; offset: number } | 'all',
): Promise<{ rows: LeadMessage[]; total: number }> {
  const params: unknown[] = [tenant.organizationId];
  let where = 'WHERE m.organization_id = $1';
  if (filter.ownerId !== null) {
    params.push(filter.ownerId);
    where += ` AND m.user_id = $${params.length}`;
  }
  if (filter.leadId !== undefined) {
    params.push(filter.leadId);
    where += ` AND m.lead_id = $${params.length}`;
  }
  const limitSql =
    paging === 'all' ? '' : `LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const [rows, count] = await Promise.all([
    db.query(`${SELECT} ${where} ORDER BY m.sent_at DESC, m.id DESC ${limitSql}`, [
      ...params,
      ...(paging === 'all' ? [] : [paging.limit, paging.offset]),
    ]),
    db.query(`SELECT COUNT(*) AS count FROM messages m ${where}`, params),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].count) };
}

export async function findById(
  db: Queryable,
  tenant: Tenant,
  id: number,
): Promise<LeadMessage | null> {
  const result = await db.query(`${SELECT} WHERE m.id = $1 AND m.organization_id = $2`, [
    id,
    tenant.organizationId,
  ]);
  return result.rows[0] ?? null;
}

export async function insert(
  db: Queryable,
  tenant: Tenant,
  data: { lead_id: number; user_id: number; message_type: string; content: string },
): Promise<number> {
  const result = await db.query(
    `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content, status)
     VALUES ($1, $2, $3, $4, $5, 'Sent') RETURNING id`,
    [tenant.organizationId, data.lead_id, data.user_id, data.message_type, data.content],
  );
  return result.rows[0].id;
}

/** Updates status within the organization; `ownerId` restricts to the sender. Returns false when nothing matched. */
export async function setStatus(
  db: Queryable,
  tenant: Tenant,
  id: number,
  status: string,
  ownerId: number | null,
): Promise<boolean> {
  const params: unknown[] = [status, id, tenant.organizationId];
  let sql = 'UPDATE messages SET status = $1 WHERE id = $2 AND organization_id = $3';
  if (ownerId !== null) {
    params.push(ownerId);
    sql += ' AND user_id = $4';
  }
  const result = await db.query(sql, params);
  return (result.rowCount ?? 0) > 0;
}
