import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { builtInRoleKeyForLegacyId, coversGrants, type GrantMap } from '@crm/permissions';
import pool from '../../config/db.js';
import { recordAuditEvent } from '../audit.js';
import { revokeUserSessions, toGrantMap, type AuthSubject } from '../auth/repository.js';
import { AppError } from '../http/errors.js';

export interface AssignableRole {
  id: number;
  key: string;
  name: string;
  legacyRoleId: number | null;
  grants: GrantMap;
}

export interface MemberView {
  id: number;
  full_name: string;
  email: string;
  username: string;
  /** DEPRECATED legacy id for UI compatibility (null for custom roles). */
  role_id: number | null;
  role_key: string;
  role_name: string;
  membership_id: number;
  membership_status: 'active' | 'invited' | 'suspended';
  is_active: boolean;
}

const MEMBER_SELECT = `
  SELECT u.id, u.full_name, u.email, u.username, r.legacy_role_id AS role_id, r.key AS role_key,
         r.name AS role_name, m.id AS membership_id, m.status AS membership_status,
         (m.status = 'active' AND COALESCE(u.is_active, true)) AS is_active
  FROM organization_memberships m
  JOIN users u ON u.id = m.user_id
  JOIN roles r ON r.id = m.role_id`;

export async function listMembers(organizationId: number): Promise<MemberView[]> {
  const result = await pool.query(
    `${MEMBER_SELECT} WHERE m.organization_id = $1 ORDER BY u.created_at DESC, u.id DESC`,
    [organizationId],
  );
  return result.rows;
}

export async function getMember(
  organizationId: number,
  userId: number,
): Promise<MemberView | null> {
  const result = await pool.query(
    `${MEMBER_SELECT} WHERE m.organization_id = $1 AND m.user_id = $2`,
    [organizationId, userId],
  );
  return result.rows[0] ?? null;
}

/** Resolves a role usable in this organization: a built-in template or one of its own roles. */
export async function resolveAssignableRole(
  organizationId: number,
  selector: { roleKey?: unknown; legacyRoleId?: unknown },
): Promise<AssignableRole | null> {
  const key =
    typeof selector.roleKey === 'string' && selector.roleKey
      ? selector.roleKey
      : builtInRoleKeyForLegacyId(selector.legacyRoleId);
  if (!key) return null;
  const result = await pool.query(
    `SELECT r.id, r.key, r.name, r.legacy_role_id,
            COALESCE(json_agg(json_build_object('permission', rp.permission_key, 'scope', rp.scope))
                     FILTER (WHERE rp.permission_key IS NOT NULL), '[]'::json) AS grants
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     WHERE r.key = $2 AND ((r.organization_id IS NULL AND r.is_system) OR r.organization_id = $1)
     GROUP BY r.id
     ORDER BY r.organization_id NULLS LAST
     LIMIT 1`,
    [organizationId, key],
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        key: row.key,
        name: row.name,
        legacyRoleId: row.legacy_role_id,
        grants: toGrantMap(row.grants),
      }
    : null;
}

export async function listAssignableRoles(organizationId: number) {
  const result = await pool.query(
    `SELECT r.key, r.name, r.description, r.is_system,
            COALESCE(json_object_agg(rp.permission_key, rp.scope) FILTER (WHERE rp.permission_key IS NOT NULL), '{}'::json) AS permissions
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     WHERE (r.organization_id IS NULL AND r.is_system) OR r.organization_id = $1
     GROUP BY r.id
     ORDER BY r.is_system DESC, r.id`,
    [organizationId],
  );
  return result.rows;
}

async function roleGrantsOfMember(
  organizationId: number,
  userId: number,
): Promise<GrantMap | null> {
  const result = await pool.query(
    `SELECT COALESCE(json_agg(json_build_object('permission', rp.permission_key, 'scope', rp.scope))
                     FILTER (WHERE rp.permission_key IS NOT NULL), '[]'::json) AS grants
     FROM organization_memberships m
     LEFT JOIN role_permissions rp ON rp.role_id = m.role_id
     WHERE m.organization_id = $1 AND m.user_id = $2
     GROUP BY m.id`,
    [organizationId, userId],
  );
  return result.rows[0] ? toGrantMap(result.rows[0].grants) : null;
}

/** Actors may only grant roles, and only manage members, within their own privileges. */
function assertWithinPrivileges(actor: AuthSubject, grants: GrantMap, message: string) {
  if (!coversGrants(actor.permissions, grants)) throw AppError.forbidden(message);
}

async function loadTargetForChange(actor: AuthSubject, targetUserId: number) {
  if (targetUserId === actor.userId) {
    throw AppError.forbidden('You cannot change your own membership');
  }
  const current = await roleGrantsOfMember(actor.organizationId, targetUserId);
  if (!current) throw AppError.notFound('User not found');
  assertWithinPrivileges(
    actor,
    current,
    'You cannot manage a member with more privileges than you',
  );
}

export async function changeMemberRole(
  actor: AuthSubject,
  targetUserId: number,
  role: AssignableRole,
) {
  await loadTargetForChange(actor, targetUserId);
  assertWithinPrivileges(
    actor,
    role.grants,
    'You cannot assign a role with more privileges than your own',
  );
  await pool.query(
    `UPDATE organization_memberships SET role_id = $3 WHERE organization_id = $1 AND user_id = $2`,
    [actor.organizationId, targetUserId, role.id],
  );
  await recordAuditEvent({
    action: 'MEMBER_ROLE_CHANGED',
    tableName: 'organization_memberships',
    recordId: targetUserId,
    newValues: { role: role.key },
  });
}

export async function setMemberStatus(
  actor: AuthSubject,
  targetUserId: number,
  status: 'active' | 'suspended',
) {
  await loadTargetForChange(actor, targetUserId);
  await pool.query(
    `UPDATE organization_memberships
     SET status = $3::varchar, joined_at = COALESCE(joined_at, CASE WHEN $3::varchar = 'active' THEN now() END)
     WHERE organization_id = $1 AND user_id = $2 AND status <> 'invited'`,
    [actor.organizationId, targetUserId, status],
  );
  if (status === 'suspended') {
    await revokeUserSessions(targetUserId, 'membership_suspended', actor.organizationId);
  }
  await recordAuditEvent({
    action: status === 'active' ? 'MEMBER_ACTIVATED' : 'MEMBER_SUSPENDED',
    tableName: 'organization_memberships',
    recordId: targetUserId,
  });
}

/** True when the user's only membership is in this organization (safe to edit identity fields). */
export async function isExclusiveMember(organizationId: number, userId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT bool_and(organization_id = $1) AS exclusive FROM organization_memberships WHERE user_id = $2`,
    [organizationId, userId],
  );
  return result.rows[0]?.exclusive === true;
}

async function uniqueUsername(base: string): Promise<string> {
  const cleaned =
    base
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 40) || 'user';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? cleaned : `${cleaned}-${randomBytes(3).toString('hex')}`;
    const taken = await pool.query('SELECT 1 FROM users WHERE username = $1', [candidate]);
    if (taken.rows.length === 0) return candidate;
  }
  return `${cleaned}-${randomBytes(6).toString('hex')}`;
}

/**
 * Adds a member. New identities are created active. An identity that already
 * exists elsewhere is NOT modified (no password/name changes by another
 * tenant); it gets an `invited` membership the user must accept.
 */
export async function addMember(
  actor: AuthSubject,
  input: { email: string; fullName: string; password: string; role: AssignableRole },
): Promise<{ member: MemberView; created: boolean }> {
  assertWithinPrivileges(
    actor,
    input.role.grants,
    'You cannot assign a role with more privileges than your own',
  );

  const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [
    input.email,
  ]);
  const existingId: number | undefined = existing.rows[0]?.id;

  if (existingId !== undefined) {
    const member = await getMember(actor.organizationId, existingId);
    if (member) throw AppError.conflict('This user is already a member of the organization');
    await pool.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role_id, status, invited_by)
       VALUES ($1, $2, $3, 'invited', $4)`,
      [actor.organizationId, existingId, input.role.id, actor.userId],
    );
    await recordAuditEvent({
      action: 'MEMBER_INVITED',
      tableName: 'organization_memberships',
      recordId: existingId,
      newValues: { role: input.role.key },
    });
    return { member: (await getMember(actor.organizationId, existingId))!, created: false };
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const username = await uniqueUsername(input.email.split('@')[0] ?? 'user');
  const client = await pool.connect();
  let userId: number;
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO users (username, full_name, email, password_hash, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [username, input.fullName, input.email, passwordHash],
    );
    userId = created.rows[0].id;
    await client.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role_id, status, invited_by, joined_at)
       VALUES ($1, $2, $3, 'active', $4, now())`,
      [actor.organizationId, userId, input.role.id, actor.userId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((error as { code?: string }).code === '23505') {
      throw AppError.conflict('A user with this email already exists');
    }
    throw error;
  } finally {
    client.release();
  }
  await recordAuditEvent({
    action: 'MEMBER_CREATED',
    tableName: 'organization_memberships',
    recordId: userId,
    newValues: { email: input.email, role: input.role.key },
  });
  return { member: (await getMember(actor.organizationId, userId))!, created: true };
}
