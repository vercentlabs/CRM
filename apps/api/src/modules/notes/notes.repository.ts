import type { Queryable } from '@crm/database';
import type { Note } from '@crm/types';
import type { Tenant } from '../../platform/tenancy.js';

/** Notes (soft delete via is_deleted). OWN scope = created_by. */

const SELECT = `
  SELECT n.id, n.title, n.content, n.color, n.tags, n.created_by, n.created_at, n.updated_at,
         u.full_name AS author_name, u.email AS author_email
  FROM notes n
  LEFT JOIN users u ON u.id = n.created_by`;

export const NOTE_SORTS = {
  updated_at: 'n.updated_at',
  created_at: 'n.created_at',
  title: 'n.title',
} as const;

export interface NoteFilter {
  ownerId: number | null;
  search?: string | undefined;
  authorId?: number | undefined;
  tags?: string[] | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

/** One WHERE builder for list and count, so they can never drift (the pre-Phase-2 bug). */
export function noteWhere(tenant: Tenant, filter: NoteFilter) {
  const conditions = ['n.organization_id = $1', 'n.is_deleted = FALSE'];
  const params: unknown[] = [tenant.organizationId];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    conditions.push(sql(`$${params.length}`));
  };
  if (filter.ownerId !== null) add((p) => `n.created_by = ${p}`, filter.ownerId);
  if (filter.search) {
    add(
      (p) => `(n.title ILIKE ${p} OR n.content ILIKE ${p})`,
      `%${filter.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
    );
  }
  if (filter.authorId !== undefined) add((p) => `n.created_by = ${p}`, filter.authorId);
  if (filter.tags && filter.tags.length > 0) add((p) => `n.tags && ${p}::text[]`, filter.tags);
  if (filter.from) add((p) => `n.created_at >= ${p}`, filter.from);
  if (filter.to) add((p) => `n.created_at <= ${p}`, filter.to);
  return { where: `WHERE ${conditions.join(' AND ')}`, params };
}

const withTags = (note: Note): Note => ({
  ...note,
  tags: Array.isArray(note.tags) ? note.tags : [],
});

export async function list(
  db: Queryable,
  tenant: Tenant,
  filter: NoteFilter,
  orderBy: string,
  paging: { limit: number; offset: number },
): Promise<{ rows: Note[]; total: number }> {
  const { where, params } = noteWhere(tenant, filter);
  const [rows, count] = await Promise.all([
    db.query(
      `${SELECT} ${where} ORDER BY ${orderBy}, n.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, paging.limit, paging.offset],
    ),
    db.query(`SELECT COUNT(*) AS count FROM notes n ${where}`, params),
  ]);
  return { rows: rows.rows.map(withTags), total: Number(count.rows[0].count) };
}

export async function findLive(db: Queryable, tenant: Tenant, id: number): Promise<Note | null> {
  const result = await db.query(
    `${SELECT} WHERE n.id = $1 AND n.organization_id = $2 AND n.is_deleted = FALSE`,
    [id, tenant.organizationId],
  );
  return result.rows[0] ? withTags(result.rows[0]) : null;
}

export async function insert(
  db: Queryable,
  tenant: Tenant,
  data: { title: string; content: string; color: string; tags: string[] },
  createdBy: number,
): Promise<number> {
  const result = await db.query(
    `INSERT INTO notes (organization_id, title, content, color, tags, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [tenant.organizationId, data.title, data.content, data.color, data.tags, createdBy],
  );
  return result.rows[0].id;
}

export async function update(
  db: Queryable,
  tenant: Tenant,
  id: number,
  data: { title: string; content: string; color: string; tags: string[] },
): Promise<void> {
  await db.query(
    `UPDATE notes SET title = $1, content = $2, color = $3, tags = $4 WHERE id = $5 AND organization_id = $6`,
    [data.title, data.content, data.color, data.tags, id, tenant.organizationId],
  );
}

export async function softDelete(db: Queryable, tenant: Tenant, id: number): Promise<void> {
  await db.query('UPDATE notes SET is_deleted = TRUE WHERE id = $1 AND organization_id = $2', [
    id,
    tenant.organizationId,
  ]);
}
