import type { Queryable } from '@crm/database';
import type { AuditLogEntry } from '@crm/types';
import type { Tenant } from '../../platform/tenancy.js';

/**
 * Reads the organization's audit log. Platform rows (organization_id NULL)
 * and other organizations' rows are never visible. Writing stays in
 * platform/audit.ts so every module can record events.
 */

export interface AuditFilter {
  userId?: number | undefined;
  tableName?: string | undefined;
  action?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export async function list(
  db: Queryable,
  tenant: Tenant,
  filter: AuditFilter,
  paging: { limit: number; offset: number },
): Promise<{ rows: AuditLogEntry[]; total: number }> {
  const conditions = ['al.organization_id = $1'];
  const params: unknown[] = [tenant.organizationId];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    conditions.push(`${sql} $${params.length}`);
  };
  if (filter.userId !== undefined) add('al.user_id =', filter.userId);
  if (filter.tableName) add('al.table_name =', filter.tableName);
  if (filter.action) add('al.action =', filter.action);
  if (filter.from) add('al.created_at >=', filter.from);
  if (filter.to) add('al.created_at <=', filter.to);
  const where = `WHERE ${conditions.join(' AND ')}`;
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT al.id, al.user_id, u.email AS user_email, al.action, al.table_name, al.record_id,
              al.old_values, al.new_values, al.ip_address, al.user_agent, al.request_id, al.created_at
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, paging.limit, paging.offset],
    ),
    db.query(`SELECT COUNT(*) AS total FROM audit_logs al ${where}`, params),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].total) };
}
