import type { Queryable } from '@crm/database';
import type { Notification } from '@crm/types';
import type { Tenant } from '../../platform/tenancy.js';

/**
 * Personal notifications. Every statement is bound to BOTH the organization
 * and the recipient, so a member can only ever see or change their own
 * notifications in the active organization.
 */

const SELECT = `SELECT public_id AS id, type, title, body, entity_type, entity_id, read_at, created_at
                FROM notifications`;

export async function list(
  db: Queryable,
  tenant: Tenant,
  userId: number,
  filter: { unreadOnly: boolean },
  paging: { limit: number; offset: number },
): Promise<{ rows: Notification[]; total: number }> {
  const where = `WHERE organization_id = $1 AND user_id = $2${filter.unreadOnly ? ' AND read_at IS NULL' : ''}`;
  const [rows, count] = await Promise.all([
    db.query(`${SELECT} ${where} ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`, [
      tenant.organizationId,
      userId,
      paging.limit,
      paging.offset,
    ]),
    db.query(`SELECT COUNT(*)::int AS count FROM notifications ${where}`, [
      tenant.organizationId,
      userId,
    ]),
  ]);
  return { rows: rows.rows, total: count.rows[0].count };
}

export async function unreadCount(db: Queryable, tenant: Tenant, userId: number): Promise<number> {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count FROM notifications
     WHERE organization_id = $1 AND user_id = $2 AND read_at IS NULL`,
    [tenant.organizationId, userId],
  );
  return result.rows[0].count;
}

/** Marks one notification read; false when it is not the caller's (or does not exist). */
export async function markRead(
  db: Queryable,
  tenant: Tenant,
  userId: number,
  publicId: string,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, now())
     WHERE organization_id = $1 AND user_id = $2 AND public_id::text = $3`,
    [tenant.organizationId, userId, publicId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markAllRead(db: Queryable, tenant: Tenant, userId: number): Promise<number> {
  const result = await db.query(
    `UPDATE notifications SET read_at = now()
     WHERE organization_id = $1 AND user_id = $2 AND read_at IS NULL`,
    [tenant.organizationId, userId],
  );
  return result.rowCount ?? 0;
}
