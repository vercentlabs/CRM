import type { Queryable } from '@crm/database';
import type { ExecutiveLocation, SalesLocation } from '@crm/types';
import type { Tenant } from '../../platform/tenancy.js';

/** Sales locations and member check-ins (both organization-owned). */

const SELECT = `
  SELECT sl.id, sl.name, sl.address, sl.city, sl.state, sl.country, sl.pin_code, sl.contact_phone,
         sl.manager_id, sl.created_at, u.full_name AS manager_name
  FROM sales_locations sl
  LEFT JOIN users u ON u.id = sl.manager_id`;

export interface LocationWrite {
  name?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string;
  pin_code?: string | null;
  contact_phone?: string | null;
  manager_id?: number | null;
}

const WRITABLE = [
  'name',
  'address',
  'city',
  'state',
  'country',
  'pin_code',
  'contact_phone',
  'manager_id',
] as const satisfies readonly (keyof LocationWrite)[];

export async function list(db: Queryable, tenant: Tenant): Promise<SalesLocation[]> {
  const result = await db.query(`${SELECT} WHERE sl.organization_id = $1 ORDER BY sl.name, sl.id`, [
    tenant.organizationId,
  ]);
  return result.rows;
}

export async function findById(
  db: Queryable,
  tenant: Tenant,
  id: number,
): Promise<SalesLocation | null> {
  const result = await db.query(`${SELECT} WHERE sl.id = $1 AND sl.organization_id = $2`, [
    id,
    tenant.organizationId,
  ]);
  return result.rows[0] ?? null;
}

export async function exists(db: Queryable, tenant: Tenant, id: number): Promise<boolean> {
  const result = await db.query(
    'SELECT 1 FROM sales_locations WHERE id = $1 AND organization_id = $2',
    [id, tenant.organizationId],
  );
  return result.rows.length > 0;
}

export async function insert(
  db: Queryable,
  tenant: Tenant,
  data: LocationWrite & { name: string },
): Promise<number> {
  const columns = WRITABLE.filter((key) => data[key] !== undefined);
  const result = await db.query(
    `INSERT INTO sales_locations (organization_id, ${columns.join(', ')})
     VALUES ($1, ${columns.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING id`,
    [tenant.organizationId, ...columns.map((key) => data[key])],
  );
  return result.rows[0].id;
}

export async function update(
  db: Queryable,
  tenant: Tenant,
  id: number,
  patch: LocationWrite,
): Promise<void> {
  const columns = WRITABLE.filter((key) => patch[key] !== undefined);
  if (columns.length === 0) return;
  await db.query(
    `UPDATE sales_locations SET ${columns.map((key, i) => `${key} = $${i + 1}`).join(', ')}
     WHERE id = $${columns.length + 1} AND organization_id = $${columns.length + 2}`,
    [...columns.map((key) => patch[key]), id, tenant.organizationId],
  );
}

export async function countReferencingLeads(
  db: Queryable,
  tenant: Tenant,
  id: number,
): Promise<number> {
  const result = await db.query(
    'SELECT COUNT(*) AS count FROM leads WHERE location_id = $1 AND organization_id = $2',
    [id, tenant.organizationId],
  );
  return Number(result.rows[0].count);
}

export async function remove(db: Queryable, tenant: Tenant, id: number): Promise<void> {
  await db.query('DELETE FROM sales_locations WHERE id = $1 AND organization_id = $2', [
    id,
    tenant.organizationId,
  ]);
}

/** One current location per member per organization. */
export async function upsertCheckIn(
  db: Queryable,
  tenant: Tenant,
  userId: number,
  data: { latitude: number; longitude: number; address: string | null },
) {
  const result = await db.query(
    `INSERT INTO user_locations (organization_id, user_id, latitude, longitude, address)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id, user_id) DO UPDATE
       SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
           address = EXCLUDED.address, updated_at = CURRENT_TIMESTAMP
     RETURNING id, user_id, latitude, longitude, address, updated_at`,
    [tenant.organizationId, userId, data.latitude, data.longitude, data.address],
  );
  return result.rows[0];
}

/** Active members allowed to check in, with their latest location in this organization. */
export async function executives(db: Queryable, tenant: Tenant): Promise<ExecutiveLocation[]> {
  const result = await db.query(
    `SELECT u.id, u.full_name, ul.latitude, ul.longitude, ul.address, ul.updated_at
     FROM organization_memberships m
     JOIN users u ON u.id = m.user_id AND COALESCE(u.is_active, true)
     LEFT JOIN user_locations ul ON ul.user_id = u.id AND ul.organization_id = m.organization_id
     WHERE m.organization_id = $1 AND m.status = 'active'
       AND EXISTS (
         SELECT 1 FROM role_permissions rp
         WHERE rp.role_id = m.role_id AND rp.permission_key = 'crm.locations.checkin'
       )
     ORDER BY u.full_name`,
    [tenant.organizationId],
  );
  return result.rows;
}
