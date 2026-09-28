import type { Queryable } from '@crm/database';
import type { Opportunity } from '@crm/types';
import type { Tenant } from '../../platform/tenancy.js';

/**
 * Opportunity persistence. OWN scope = assigned to me, or unassigned and
 * created by me. The (organization_id, lead_id) foreign key guarantees the
 * linked lead belongs to the same organization.
 */

export const ownOpportunityClause = (alias: string, param: string) =>
  `(${alias}.assigned_to = ${param} OR (${alias}.assigned_to IS NULL AND ${alias}.created_by = ${param}))`;

export const isOwnOpportunity = (
  row: { assigned_to: number | null; created_by: number },
  userId: number,
) => row.assigned_to === userId || (row.assigned_to === null && row.created_by === userId);

const SELECT = `
  SELECT o.id, o.lead_id, o.title, o.description, o.value, o.stage, o.probability, o.expected_close_date,
         o.created_by, o.assigned_to, o.created_at, o.updated_at,
         l.full_name AS lead_name, l.email AS lead_email, u.full_name AS assigned_to_name
  FROM opportunities o
  LEFT JOIN leads l ON l.id = o.lead_id AND l.organization_id = o.organization_id
  LEFT JOIN users u ON u.id = o.assigned_to`;

export const OPPORTUNITY_SORTS = {
  created_at: 'o.created_at',
  expected_close_date: 'o.expected_close_date',
  value: 'o.value',
  stage: 'o.stage',
} as const;

export interface OpportunityWrite {
  title?: string;
  description?: string | null;
  value?: number | null;
  stage?: string;
  probability?: number | null;
  expected_close_date?: string | null;
  assigned_to?: number | null;
}

const WRITABLE = [
  'title',
  'description',
  'value',
  'stage',
  'probability',
  'expected_close_date',
  'assigned_to',
] as const satisfies readonly (keyof OpportunityWrite)[];

export async function list(
  db: Queryable,
  tenant: Tenant,
  filter: { ownerId: number | null; stage?: string | undefined; leadId?: number | undefined },
  orderBy: string,
  paging: { limit: number; offset: number },
): Promise<{ rows: Opportunity[]; total: number }> {
  const params: unknown[] = [tenant.organizationId];
  const conditions = ['o.organization_id = $1'];
  if (filter.ownerId !== null) {
    params.push(filter.ownerId);
    conditions.push(ownOpportunityClause('o', `$${params.length}`));
  }
  if (filter.stage) {
    params.push(filter.stage);
    conditions.push(`o.stage = $${params.length}`);
  }
  if (filter.leadId !== undefined) {
    params.push(filter.leadId);
    conditions.push(`o.lead_id = $${params.length}`);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const [rows, count] = await Promise.all([
    db.query(
      `${SELECT} ${where} ORDER BY ${orderBy}, o.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, paging.limit, paging.offset],
    ),
    db.query(`SELECT COUNT(*) AS count FROM opportunities o ${where}`, params),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].count) };
}

export async function findById(
  db: Queryable,
  tenant: Tenant,
  id: number,
): Promise<Opportunity | null> {
  const result = await db.query(`${SELECT} WHERE o.id = $1 AND o.organization_id = $2`, [
    id,
    tenant.organizationId,
  ]);
  return result.rows[0] ?? null;
}

export async function lockById(db: Queryable, tenant: Tenant, id: number) {
  const result = await db.query(
    'SELECT id, assigned_to, created_by, stage FROM opportunities WHERE id = $1 AND organization_id = $2 FOR UPDATE',
    [id, tenant.organizationId],
  );
  return (
    (result.rows[0] as
      { id: number; assigned_to: number | null; created_by: number; stage: string } | undefined) ??
    null
  );
}

export async function insert(
  db: Queryable,
  tenant: Tenant,
  data: OpportunityWrite & { lead_id: number; title: string },
  createdBy: number,
): Promise<number> {
  const result = await db.query(
    `INSERT INTO opportunities (organization_id, lead_id, title, description, value, stage, probability,
                                expected_close_date, created_by, assigned_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      tenant.organizationId,
      data.lead_id,
      data.title,
      data.description ?? null,
      data.value ?? null,
      data.stage ?? 'Prospecting',
      data.probability ?? null,
      data.expected_close_date ?? null,
      createdBy,
      data.assigned_to ?? null,
    ],
  );
  return result.rows[0].id;
}

export async function update(
  db: Queryable,
  tenant: Tenant,
  id: number,
  patch: OpportunityWrite,
): Promise<string[]> {
  const columns = WRITABLE.filter((key) => patch[key] !== undefined);
  if (columns.length === 0) return [];
  await db.query(
    `UPDATE opportunities SET ${columns.map((key, i) => `${key} = $${i + 1}`).join(', ')}
     WHERE id = $${columns.length + 1} AND organization_id = $${columns.length + 2}`,
    [...columns.map((key) => patch[key]), id, tenant.organizationId],
  );
  return columns;
}
