import type { Queryable } from '@crm/database';
import type { Task } from '@crm/types';
import type { Tenant } from '../../platform/tenancy.js';

/** Task persistence (also backs calendar events). OWN scope = assigned_to. */

const SELECT = `
  SELECT t.id, t.title, t.description, t.due_date, t.priority, t.status, t.assigned_to, t.created_by,
         t.created_at, t.updated_at, u.full_name AS assigned_to_name, u.email AS assigned_to_email
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assigned_to`;

export const TASK_SORTS = {
  due_date: 't.due_date',
  created_at: 't.created_at',
  priority: 't.priority',
  status: 't.status',
} as const;

export interface TaskWrite {
  title?: string;
  description?: string | null;
  due_date?: string;
  priority?: string;
  status?: string;
  assigned_to?: number | null;
}

const WRITABLE = [
  'title',
  'description',
  'due_date',
  'priority',
  'status',
  'assigned_to',
] as const satisfies readonly (keyof TaskWrite)[];

export interface TaskFilter {
  ownerId: number | null;
  status?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export async function list(
  db: Queryable,
  tenant: Tenant,
  filter: TaskFilter,
  orderBy: string,
  paging: { limit: number; offset: number } | 'all',
): Promise<{ rows: Task[]; total: number }> {
  const params: unknown[] = [tenant.organizationId];
  const conditions = ['t.organization_id = $1'];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    conditions.push(sql(`$${params.length}`));
  };
  if (filter.ownerId !== null) add((p) => `t.assigned_to = ${p}`, filter.ownerId);
  if (filter.status) add((p) => `t.status = ${p}`, filter.status);
  if (filter.from) add((p) => `t.due_date >= ${p}`, filter.from);
  if (filter.to) add((p) => `t.due_date <= ${p}`, filter.to);
  const where = `WHERE ${conditions.join(' AND ')}`;
  const limitSql =
    paging === 'all' ? '' : `LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const [rows, count] = await Promise.all([
    db.query(`${SELECT} ${where} ORDER BY ${orderBy}, t.id ${limitSql}`, [
      ...params,
      ...(paging === 'all' ? [] : [paging.limit, paging.offset]),
    ]),
    db.query(`SELECT COUNT(*) AS count FROM tasks t ${where}`, params),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].count) };
}

export async function findById(db: Queryable, tenant: Tenant, id: number): Promise<Task | null> {
  const result = await db.query(`${SELECT} WHERE t.id = $1 AND t.organization_id = $2`, [
    id,
    tenant.organizationId,
  ]);
  return result.rows[0] ?? null;
}

export async function insert(
  db: Queryable,
  tenant: Tenant,
  data: Required<Pick<TaskWrite, 'title' | 'due_date' | 'priority' | 'status'>> & TaskWrite,
  createdBy: number,
): Promise<number> {
  const result = await db.query(
    `INSERT INTO tasks (organization_id, title, description, due_date, priority, status, assigned_to, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      tenant.organizationId,
      data.title,
      data.description ?? null,
      data.due_date,
      data.priority,
      data.status,
      data.assigned_to ?? null,
      createdBy,
    ],
  );
  return result.rows[0].id;
}

export async function update(
  db: Queryable,
  tenant: Tenant,
  id: number,
  patch: TaskWrite,
): Promise<void> {
  const columns = WRITABLE.filter((key) => patch[key] !== undefined);
  if (columns.length === 0) return;
  await db.query(
    `UPDATE tasks SET ${columns.map((key, i) => `${key} = $${i + 1}`).join(', ')}, updated_at = NOW()
     WHERE id = $${columns.length + 1} AND organization_id = $${columns.length + 2}`,
    [...columns.map((key) => patch[key]), id, tenant.organizationId],
  );
}

/** Permanent delete (historical behaviour for tasks and calendar events). */
export async function remove(db: Queryable, tenant: Tenant, id: number): Promise<void> {
  await db.query('DELETE FROM tasks WHERE id = $1 AND organization_id = $2', [
    id,
    tenant.organizationId,
  ]);
}
