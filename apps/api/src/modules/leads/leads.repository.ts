import type { Queryable } from '@crm/database';
import type { Lead } from '@crm/types';
import type { Tenant } from '../../platform/tenancy.js';

/**
 * Lead persistence. Every statement is bounded by `tenant.organizationId`.
 * `ownerId` (non-null) applies the OWN scope: assigned to the user, or
 * unassigned and created by the user.
 */

export const ownLeadClause = (alias: string, param: string) =>
  `(${alias}.assigned_to = ${param} OR (${alias}.assigned_to IS NULL AND ${alias}.created_by = ${param}))`;

export const isOwnLead = (
  lead: { assigned_to: number | null; created_by: number | null },
  userId: number,
) => lead.assigned_to === userId || (lead.assigned_to === null && lead.created_by === userId);

const SELECT_LEAD = `
  SELECT l.id, l.full_name, l.mobile_number, l.alternate_number, l.email, l.source, l.notes, l.age,
         l.address, l.occupation, l.monthly_income, l.is_aware_of_digital_gold, l.status, l.next_call_at,
         l.created_by, l.assigned_to, l.location_id, l.created_at, l.updated_at,
         u.full_name AS assigned_user_name,
         loc.name AS location_name
  FROM leads l
  LEFT JOIN users u ON u.id = l.assigned_to
  LEFT JOIN sales_locations loc ON loc.id = l.location_id AND loc.organization_id = l.organization_id`;

export const LEAD_SORTS = {
  created_at: 'l.created_at',
  updated_at: 'l.updated_at',
  full_name: 'l.full_name',
  status: 'l.status',
  next_call_at: 'l.next_call_at',
} as const;

export interface LeadListFilter {
  ownerId: number | null;
  status?: string | undefined;
  assignedTo?: number | undefined;
  dateFrom?: string | undefined;
  /** Inclusive calendar date. */
  dateTo?: string | undefined;
  search?: string | undefined;
}

export interface Paging {
  limit: number;
  offset: number;
}

export async function findById(db: Queryable, tenant: Tenant, id: number): Promise<Lead | null> {
  const result = await db.query(`${SELECT_LEAD} WHERE l.id = $1 AND l.organization_id = $2`, [
    id,
    tenant.organizationId,
  ]);
  return result.rows[0] ?? null;
}

/** Row lock inside a transaction; returns the fields needed for authorization. */
export async function lockById(db: Queryable, tenant: Tenant, id: number) {
  const result = await db.query(
    `SELECT id, assigned_to, created_by, status FROM leads WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [id, tenant.organizationId],
  );
  return (
    (result.rows[0] as
      | { id: number; assigned_to: number | null; created_by: number | null; status: string }
      | undefined) ?? null
  );
}

function listWhere(tenant: Tenant, filter: LeadListFilter) {
  const conditions = ['l.organization_id = $1'];
  const params: unknown[] = [tenant.organizationId];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    conditions.push(sql(`$${params.length}`));
  };
  if (filter.ownerId !== null) add((p) => ownLeadClause('l', p), filter.ownerId);
  if (filter.status) add((p) => `l.status = ${p}`, filter.status);
  if (filter.assignedTo !== undefined) add((p) => `l.assigned_to = ${p}`, filter.assignedTo);
  if (filter.dateFrom) add((p) => `l.created_at::date >= ${p}::date`, filter.dateFrom);
  if (filter.dateTo) add((p) => `l.created_at::date <= ${p}::date`, filter.dateTo);
  if (filter.search) {
    add(
      (p) => `(l.full_name ILIKE ${p} OR l.email ILIKE ${p} OR l.mobile_number ILIKE ${p})`,
      `%${filter.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
    );
  }
  return { where: `WHERE ${conditions.join(' AND ')}`, params };
}

export async function list(
  db: Queryable,
  tenant: Tenant,
  filter: LeadListFilter,
  orderBy: string,
  paging: Paging,
): Promise<{ rows: Lead[]; total: number }> {
  const { where, params } = listWhere(tenant, filter);
  const [rows, count] = await Promise.all([
    db.query(
      `${SELECT_LEAD} ${where} ORDER BY ${orderBy}, l.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, paging.limit, paging.offset],
    ),
    db.query(`SELECT COUNT(*) AS count FROM leads l ${where}`, params),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].count) };
}

export interface LeadWrite {
  full_name?: string;
  mobile_number?: string;
  alternate_number?: string | null;
  email?: string | null;
  source?: string | null;
  notes?: string | null;
  age?: number | null;
  address?: string | null;
  occupation?: string | null;
  monthly_income?: number | null;
  is_aware_of_digital_gold?: boolean;
  status?: string;
  next_call_at?: string | null;
  assigned_to?: number | null;
  location_id?: number | null;
}

const WRITABLE = [
  'full_name',
  'mobile_number',
  'alternate_number',
  'email',
  'source',
  'notes',
  'age',
  'address',
  'occupation',
  'monthly_income',
  'is_aware_of_digital_gold',
  'status',
  'next_call_at',
  'assigned_to',
  'location_id',
] as const satisfies readonly (keyof LeadWrite)[];

export async function insert(
  db: Queryable,
  tenant: Tenant,
  data: LeadWrite,
  createdBy: number,
): Promise<number> {
  const columns = WRITABLE.filter((key) => data[key] !== undefined);
  const values = columns.map((key) => data[key]);
  const result = await db.query(
    `INSERT INTO leads (organization_id, created_by, ${columns.join(', ')})
     VALUES ($1, $2, ${columns.map((_, i) => `$${i + 3}`).join(', ')})
     RETURNING id`,
    [tenant.organizationId, createdBy, ...values],
  );
  return result.rows[0].id;
}

/** Updates only the provided (allow-listed) columns; returns the updated column names. */
export async function update(
  db: Queryable,
  tenant: Tenant,
  id: number,
  patch: LeadWrite,
): Promise<string[]> {
  const columns = WRITABLE.filter((key) => patch[key] !== undefined);
  if (columns.length === 0) return [];
  await db.query(
    `UPDATE leads SET ${columns.map((key, i) => `${key} = $${i + 1}`).join(', ')}
     WHERE id = $${columns.length + 1} AND organization_id = $${columns.length + 2}`,
    [...columns.map((key) => patch[key]), id, tenant.organizationId],
  );
  return columns;
}

/** Ids from `ids` that exist in the organization (and, with `ownerId`, are owned by that user). */
export async function visibleIds(
  db: Queryable,
  tenant: Tenant,
  ids: number[],
  ownerId: number | null,
): Promise<number[]> {
  if (ids.length === 0) return [];
  const params: unknown[] = [tenant.organizationId, ids];
  let sql = 'SELECT l.id FROM leads l WHERE l.organization_id = $1 AND l.id = ANY($2::int[])';
  if (ownerId !== null) {
    params.push(ownerId);
    sql += ` AND ${ownLeadClause('l', '$3')}`;
  }
  const result = await db.query(sql, params);
  return result.rows.map((row: { id: number }) => row.id);
}

/** Phone numbers for dialing (tenant-bound). */
export async function findForCall(db: Queryable, tenant: Tenant, id: number) {
  const result = await db.query(
    `SELECT id, assigned_to, created_by, mobile_number, alternate_number FROM leads WHERE id = $1 AND organization_id = $2`,
    [id, tenant.organizationId],
  );
  return (
    (result.rows[0] as
      | {
          id: number;
          assigned_to: number | null;
          created_by: number | null;
          mobile_number: string | null;
          alternate_number: string | null;
        }
      | undefined) ?? null
  );
}
