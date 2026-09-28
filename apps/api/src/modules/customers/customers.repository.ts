import type { Queryable } from '@crm/database';
import type { Customer } from '@crm/types';
import type { Tenant } from '../../platform/tenancy.js';

/** Customer persistence (organization-bound; OWN scope = assigned_to). */

const COLUMNS =
  'c.id, c.name, c.email, c.phone, c.address, c.assigned_to, c.created_by, c.created_at, c.updated_at';

export const CUSTOMER_SORTS = {
  created_at: 'c.created_at',
  name: 'c.name',
  email: 'c.email',
} as const;

export interface CustomerWrite {
  name?: string;
  email?: string;
  phone?: string | null;
  address?: string | null;
  assigned_to?: number | null;
}

const WRITABLE = [
  'name',
  'email',
  'phone',
  'address',
  'assigned_to',
] as const satisfies readonly (keyof CustomerWrite)[];

export async function list(
  db: Queryable,
  tenant: Tenant,
  ownerId: number | null,
  orderBy: string,
  paging: { limit: number; offset: number } | 'all',
): Promise<{ rows: Customer[]; total: number }> {
  const params: unknown[] = [tenant.organizationId];
  let where = 'WHERE c.organization_id = $1';
  if (ownerId !== null) {
    params.push(ownerId);
    where += ` AND c.assigned_to = $${params.length}`;
  }
  const limitSql =
    paging === 'all' ? '' : `LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT ${COLUMNS} FROM customers c ${where} ORDER BY ${orderBy}, c.id DESC ${limitSql}`,
      [...params, ...(paging === 'all' ? [] : [paging.limit, paging.offset])],
    ),
    db.query(`SELECT COUNT(*) AS count FROM customers c ${where}`, params),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].count) };
}

export async function findById(
  db: Queryable,
  tenant: Tenant,
  id: number,
): Promise<Customer | null> {
  const result = await db.query(
    `SELECT ${COLUMNS} FROM customers c WHERE c.id = $1 AND c.organization_id = $2`,
    [id, tenant.organizationId],
  );
  return result.rows[0] ?? null;
}

/** Customer emails are unique per organization. */
export async function emailTaken(
  db: Queryable,
  tenant: Tenant,
  email: string,
  exceptId?: number,
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM customers WHERE organization_id = $1 AND email = $2 AND ($3::int IS NULL OR id <> $3)`,
    [tenant.organizationId, email, exceptId ?? null],
  );
  return result.rows.length > 0;
}

export async function insert(
  db: Queryable,
  tenant: Tenant,
  data: Required<Pick<CustomerWrite, 'name' | 'email'>> & CustomerWrite,
  createdBy: number,
): Promise<Customer> {
  const result = await db.query(
    `INSERT INTO customers (organization_id, name, email, phone, address, assigned_to, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      tenant.organizationId,
      data.name,
      data.email,
      data.phone ?? null,
      data.address ?? null,
      data.assigned_to ?? null,
      createdBy,
    ],
  );
  return (await findById(db, tenant, result.rows[0].id))!;
}

/** Lead conversion: create the customer unless the organization already has that email. */
export async function insertIfAbsent(
  db: Queryable,
  tenant: Tenant,
  data: {
    name: string;
    email: string;
    phone: string | null;
    address: string | null;
    assigned_to: number | null;
    created_by: number;
  },
): Promise<number | null> {
  const result = await db.query(
    `INSERT INTO customers (organization_id, name, email, phone, address, assigned_to, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (organization_id, email) DO NOTHING
     RETURNING id`,
    [
      tenant.organizationId,
      data.name,
      data.email,
      data.phone,
      data.address,
      data.assigned_to,
      data.created_by,
    ],
  );
  return result.rows[0]?.id ?? null;
}

export async function update(
  db: Queryable,
  tenant: Tenant,
  id: number,
  patch: CustomerWrite,
): Promise<Customer | null> {
  const columns = WRITABLE.filter((key) => patch[key] !== undefined);
  if (columns.length > 0) {
    await db.query(
      `UPDATE customers SET ${columns.map((key, i) => `${key} = $${i + 1}`).join(', ')}, updated_at = NOW()
       WHERE id = $${columns.length + 1} AND organization_id = $${columns.length + 2}`,
      [...columns.map((key) => patch[key]), id, tenant.organizationId],
    );
  }
  return findById(db, tenant, id);
}

export async function remove(db: Queryable, tenant: Tenant, id: number): Promise<Customer | null> {
  const result = await db.query(
    `DELETE FROM customers c WHERE c.id = $1 AND c.organization_id = $2 RETURNING ${COLUMNS}`,
    [id, tenant.organizationId],
  );
  return result.rows[0] ?? null;
}
