import type { Queryable } from '@crm/database';
import type { GrantMap } from '@crm/permissions';
import type { Member } from '@crm/types';
import { toGrantMap } from '../../platform/auth/repository.js';
import type { Tenant } from '../../platform/tenancy.js';

/** Memberships, roles and identities as seen from one organization. */

export interface AssignableRole {
  id: number;
  key: string;
  name: string;
  grants: GrantMap;
}

const MEMBER_SELECT = `
  SELECT u.id, u.full_name, u.email, u.username, r.key AS role_key,
         r.name AS role_name, m.id AS membership_id, m.status AS membership_status,
         (m.status = 'active' AND COALESCE(u.is_active, true)) AS is_active
  FROM organization_memberships m
  JOIN users u ON u.id = m.user_id
  JOIN roles r ON r.id = m.role_id`;

const GRANTS_JSON = `COALESCE(json_agg(json_build_object('permission', rp.permission_key, 'scope', rp.scope))
                              FILTER (WHERE rp.permission_key IS NOT NULL), '[]'::json)`;

export async function listMembers(
  db: Queryable,
  tenant: Tenant,
  paging: { limit: number; offset: number } | 'all',
): Promise<{ rows: Member[]; total: number }> {
  const limitSql = paging === 'all' ? '' : 'LIMIT $2 OFFSET $3';
  const [rows, count] = await Promise.all([
    db.query(
      `${MEMBER_SELECT} WHERE m.organization_id = $1 ORDER BY u.created_at DESC, u.id DESC ${limitSql}`,
      [tenant.organizationId, ...(paging === 'all' ? [] : [paging.limit, paging.offset])],
    ),
    db.query('SELECT COUNT(*) AS count FROM organization_memberships WHERE organization_id = $1', [
      tenant.organizationId,
    ]),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].count) };
}

export async function findMember(
  db: Queryable,
  tenant: Tenant,
  userId: number,
): Promise<Member | null> {
  const result = await db.query(
    `${MEMBER_SELECT} WHERE m.organization_id = $1 AND m.user_id = $2`,
    [tenant.organizationId, userId],
  );
  return result.rows[0] ?? null;
}

/** A built-in template or a role owned by this organization. */
export async function findAssignableRole(
  db: Queryable,
  tenant: Tenant,
  key: string,
): Promise<AssignableRole | null> {
  const result = await db.query(
    `SELECT r.id, r.key, r.name, ${GRANTS_JSON} AS grants
     FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id
     WHERE r.key = $2 AND ((r.organization_id IS NULL AND r.is_system) OR r.organization_id = $1)
     GROUP BY r.id ORDER BY r.organization_id NULLS LAST LIMIT 1`,
    [tenant.organizationId, key],
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        key: row.key,
        name: row.name,
        grants: toGrantMap(row.grants),
      }
    : null;
}

export async function listAssignableRoles(db: Queryable, tenant: Tenant) {
  const result = await db.query(
    `SELECT r.key, r.name, r.description, r.is_system,
            COALESCE(json_object_agg(rp.permission_key, rp.scope) FILTER (WHERE rp.permission_key IS NOT NULL), '{}'::json) AS permissions
     FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id
     WHERE (r.organization_id IS NULL AND r.is_system) OR r.organization_id = $1
     GROUP BY r.id ORDER BY r.is_system DESC, r.id`,
    [tenant.organizationId],
  );
  return result.rows as {
    key: string;
    name: string;
    description: string | null;
    is_system: boolean;
    permissions: Record<string, string>;
  }[];
}

export async function memberGrants(
  db: Queryable,
  tenant: Tenant,
  userId: number,
): Promise<GrantMap | null> {
  const result = await db.query(
    `SELECT ${GRANTS_JSON} AS grants
     FROM organization_memberships m LEFT JOIN role_permissions rp ON rp.role_id = m.role_id
     WHERE m.organization_id = $1 AND m.user_id = $2 GROUP BY m.id`,
    [tenant.organizationId, userId],
  );
  return result.rows[0] ? toGrantMap(result.rows[0].grants) : null;
}

export async function setMemberRole(
  db: Queryable,
  tenant: Tenant,
  userId: number,
  roleId: number,
): Promise<void> {
  await db.query(
    'UPDATE organization_memberships SET role_id = $3 WHERE organization_id = $1 AND user_id = $2',
    [tenant.organizationId, userId, roleId],
  );
}

export async function setMemberStatus(
  db: Queryable,
  tenant: Tenant,
  userId: number,
  status: 'active' | 'suspended',
): Promise<void> {
  await db.query(
    `UPDATE organization_memberships
     SET status = $3::varchar, joined_at = COALESCE(joined_at, CASE WHEN $3::varchar = 'active' THEN now() END)
     WHERE organization_id = $1 AND user_id = $2 AND status <> 'invited'`,
    [tenant.organizationId, userId, status],
  );
}

/** True when the user's only membership is in this organization. */
export async function isExclusiveMember(
  db: Queryable,
  tenant: Tenant,
  userId: number,
): Promise<boolean> {
  const result = await db.query(
    'SELECT bool_and(organization_id = $1) AS exclusive FROM organization_memberships WHERE user_id = $2',
    [tenant.organizationId, userId],
  );
  return result.rows[0]?.exclusive === true;
}

export async function findUserIdByEmail(db: Queryable, email: string): Promise<number | null> {
  const result = await db.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  return result.rows[0]?.id ?? null;
}

export async function usernameTaken(db: Queryable, username: string): Promise<boolean> {
  const result = await db.query('SELECT 1 FROM users WHERE username = $1', [username]);
  return result.rows.length > 0;
}

export async function insertIdentity(
  db: Queryable,
  data: { username: string; fullName: string; email: string; passwordHash: string },
): Promise<number> {
  const result = await db.query(
    `INSERT INTO users (username, full_name, email, password_hash, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id`,
    [data.username, data.fullName, data.email, data.passwordHash],
  );
  return result.rows[0].id;
}

export async function insertMembership(
  db: Queryable,
  tenant: Tenant,
  data: { userId: number; roleId: number; status: 'active' | 'invited'; invitedBy: number },
): Promise<number> {
  const result = await db.query(
    `INSERT INTO organization_memberships (organization_id, user_id, role_id, status, invited_by, joined_at)
     VALUES ($1, $2, $3, $4::varchar, $5, CASE WHEN $4::varchar = 'active' THEN now() END)
     RETURNING id`,
    [tenant.organizationId, data.userId, data.roleId, data.status, data.invitedBy],
  );
  return result.rows[0].id;
}

export async function updateIdentity(
  db: Queryable,
  userId: number,
  data: { full_name: string; email: string; username: string },
): Promise<void> {
  await db.query('UPDATE users SET full_name = $1, email = $2, username = $3 WHERE id = $4', [
    data.full_name,
    data.email,
    data.username,
    userId,
  ]);
}

/** Organization id of a pending invitation of `userId` to an active organization. */
export async function findInvitation(
  db: Queryable,
  publicId: string,
  userId: number,
): Promise<number | null> {
  const result = await db.query(
    `SELECT m.organization_id FROM organization_memberships m
     JOIN organizations o ON o.id = m.organization_id
     WHERE o.public_id::text = $1 AND o.status = 'active' AND m.user_id = $2 AND m.status = 'invited'`,
    [publicId, userId],
  );
  return result.rows[0]?.organization_id ?? null;
}

/** Accepts an invitation of `userId` to the organization with public id `publicId`. */
export async function acceptInvitation(
  db: Queryable,
  publicId: string,
  userId: number,
): Promise<number | null> {
  const result = await db.query(
    `UPDATE organization_memberships m SET status = 'active', joined_at = now()
     FROM organizations o
     WHERE o.id = m.organization_id AND o.public_id::text = $1 AND o.status = 'active'
       AND m.user_id = $2 AND m.status = 'invited'
     RETURNING m.organization_id`,
    [publicId, userId],
  );
  return result.rows[0]?.organization_id ?? null;
}
