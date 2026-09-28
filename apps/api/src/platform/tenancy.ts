import type { Queryable } from '@crm/database';
import type { GrantMap, Permission, RecordScope } from '@crm/permissions';
import type { AuthSubject } from './auth/repository.js';
import { AppError } from './http/errors.js';

/**
 * The verified identity a service acts for. Built only from the authenticated
 * session (`req.auth`); request bodies/params never contribute tenancy.
 * Repositories require `organizationId` for every tenant-owned query.
 */
export interface Actor {
  organizationId: number;
  organizationPublicId: string;
  userId: number;
  email: string;
  permissions: GrantMap;
}

/** Tenant boundary passed to repositories (never built from client input). */
export interface Tenant {
  organizationId: number;
}

export function actorFrom(auth: AuthSubject): Actor {
  return {
    organizationId: auth.organizationId,
    organizationPublicId: auth.organizationPublicId,
    userId: auth.userId,
    email: auth.email,
    permissions: auth.permissions,
  };
}

/** Scope granted for a permission, or null when not granted. */
export function scopeOf(actor: Actor, permission: Permission): RecordScope | null {
  return actor.permissions.get(permission) ?? null;
}

/** Scope required to proceed; throws 403 when the permission is not granted at all. */
export function requireScopeOf(actor: Actor, permission: Permission): RecordScope {
  const scope = scopeOf(actor, permission);
  if (!scope) throw AppError.forbidden('You do not have permission to perform this action');
  return scope;
}

export function can(actor: Actor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

/** Ownership filter handed to repositories: `null` means organization-wide. */
export function ownerFilter(actor: Actor, permission: Permission): number | null {
  return requireScopeOf(actor, permission) === 'organization' ? null : actor.userId;
}

/** True when the user holds an active membership in the organization. */
export async function isActiveMember(
  db: Queryable,
  tenant: Tenant,
  userId: number,
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM organization_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = $1 AND m.user_id = $2 AND m.status = 'active' AND COALESCE(u.is_active, true)`,
    [tenant.organizationId, userId],
  );
  return result.rows.length > 0;
}

/** The subset of `userIds` that are active members of the organization. */
export async function filterActiveMembers(
  db: Queryable,
  tenant: Tenant,
  userIds: number[],
): Promise<number[]> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return [];
  const result = await db.query(
    `SELECT m.user_id FROM organization_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = $1 AND m.user_id = ANY($2::int[]) AND m.status = 'active'
       AND COALESCE(u.is_active, true)`,
    [tenant.organizationId, ids],
  );
  return result.rows.map((row: { user_id: number }) => row.user_id);
}

/** Throws a 400 when an assignee/manager/participant is not an active member. */
export async function assertMember(
  db: Queryable,
  tenant: Tenant,
  userId: number | null | undefined,
  label = 'Assigned user',
  field = 'assigned_to',
) {
  if (userId === null || userId === undefined) return;
  if (!(await isActiveMember(db, tenant, userId))) {
    throw AppError.validation([
      { field, message: `${label} is not a member of this organization` },
    ]);
  }
}

/** Positive integer id or null (legacy adapters answer malformed ids with 404). */
export function parseId(value: unknown): number | null {
  const text =
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,10}$/.test(text)) return null;
  const id = Number(text);
  return id > 0 && id <= 2_147_483_647 ? id : null;
}
