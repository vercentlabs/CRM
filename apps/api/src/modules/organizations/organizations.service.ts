import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { withTransaction } from '@crm/database';
import { builtInRoleKeyForLegacyId, coversGrants, type GrantMap } from '@crm/permissions';
import type { Member } from '@crm/types';
import type { updateMemberSchema } from '@crm/validation';
import type { z } from 'zod';
import { recordAuditEvent } from '../../platform/audit.js';
import { listMemberships, revokeUserSessions } from '../../platform/auth/repository.js';
import { pool } from '../../platform/db.js';
import { AppError } from '../../platform/http/errors.js';
import type { Actor } from '../../platform/tenancy.js';
import * as orgs from './organizations.repository.js';

/**
 * Membership management inside the actor's organization. Rules:
 * - nobody changes their own membership;
 * - nobody grants a role, or manages a member, beyond their own privileges;
 * - identities existing elsewhere are invited, never modified.
 */

type MemberUpdate = z.output<typeof updateMemberSchema>;

function assertWithin(actor: Actor, grants: GrantMap, message: string) {
  if (!coversGrants(actor.permissions, grants)) throw AppError.forbidden(message);
}

export async function resolveRole(
  actor: Actor,
  selector: { roleKey?: string | undefined; legacyRoleId?: unknown },
) {
  const key = selector.roleKey || builtInRoleKeyForLegacyId(selector.legacyRoleId);
  const role = key ? await orgs.findAssignableRole(pool, actor, key) : null;
  if (!role) throw AppError.validation([{ field: 'role_key', message: 'Unknown role' }]);
  return role;
}

export async function listMembers(actor: Actor, paging: { limit: number; offset: number } | 'all') {
  const { rows, total } = await orgs.listMembers(pool, actor, paging);
  return { items: rows, total };
}

export async function getMember(actor: Actor, userId: number): Promise<Member> {
  const member = await orgs.findMember(pool, actor, userId);
  if (!member) throw AppError.notFound('User not found');
  return member;
}

export const listRoles = (actor: Actor) => orgs.listAssignableRoles(pool, actor);

async function assertManageable(actor: Actor, targetUserId: number) {
  if (targetUserId === actor.userId)
    throw AppError.forbidden('You cannot change your own membership');
  const grants = await orgs.memberGrants(pool, actor, targetUserId);
  if (!grants) throw AppError.notFound('User not found');
  assertWithin(actor, grants, 'You cannot manage a member with more privileges than you');
}

export async function changeRole(
  actor: Actor,
  targetUserId: number,
  role: orgs.AssignableRole,
): Promise<void> {
  await assertManageable(actor, targetUserId);
  assertWithin(actor, role.grants, 'You cannot assign a role with more privileges than your own');
  await orgs.setMemberRole(pool, actor, targetUserId, role.id);
  await recordAuditEvent({
    action: 'MEMBER_ROLE_CHANGED',
    tableName: 'organization_memberships',
    recordId: targetUserId,
    newValues: { role: role.key },
  });
}

/** Suspension also revokes the member's sessions for this organization. */
export async function setStatus(
  actor: Actor,
  targetUserId: number,
  status: 'active' | 'suspended',
): Promise<void> {
  await assertManageable(actor, targetUserId);
  await orgs.setMemberStatus(pool, actor, targetUserId, status);
  if (status === 'suspended')
    await revokeUserSessions(targetUserId, 'membership_suspended', actor.organizationId);
  await recordAuditEvent({
    action: status === 'active' ? 'MEMBER_ACTIVATED' : 'MEMBER_SUSPENDED',
    tableName: 'organization_memberships',
    recordId: targetUserId,
  });
}

/** Legacy toggle: active ⇄ suspended (invitations must be accepted first). */
export async function toggleStatus(actor: Actor, targetUserId: number): Promise<Member> {
  const current = await getMember(actor, targetUserId);
  if (current.membership_status === 'invited')
    throw AppError.conflict('The invitation has not been accepted yet');
  await setStatus(
    actor,
    targetUserId,
    current.membership_status === 'active' ? 'suspended' : 'active',
  );
  return getMember(actor, targetUserId);
}

export async function updateMember(actor: Actor, targetUserId: number, input: MemberUpdate) {
  if (input.roleKey !== undefined)
    await changeRole(actor, targetUserId, await resolveRole(actor, { roleKey: input.roleKey }));
  if (input.status !== undefined) await setStatus(actor, targetUserId, input.status);
  return getMember(actor, targetUserId);
}

/**
 * Identity fields (name/email/username) can only be changed by the user
 * themselves or for users who belong to no other organization.
 */
export async function updateProfile(
  actor: Actor,
  targetUserId: number,
  input: { full_name: string; email: string; username: string },
): Promise<Member> {
  const current = await getMember(actor, targetUserId);
  const changed =
    input.full_name !== current.full_name ||
    input.email !== current.email ||
    input.username !== current.username;
  if (!changed) return current;
  if (targetUserId !== actor.userId && !(await orgs.isExclusiveMember(pool, actor, targetUserId))) {
    throw AppError.forbidden(
      'This user belongs to other organizations; only they can change their profile',
    );
  }
  try {
    await orgs.updateIdentity(pool, targetUserId, input);
  } catch (error) {
    if ((error as { code?: string }).code === '23505')
      throw AppError.conflict('Email or username already exists');
    throw error;
  }
  await recordAuditEvent({
    action: 'USER_PROFILE_UPDATED',
    tableName: 'users',
    recordId: targetUserId,
    oldValues: { full_name: current.full_name, email: current.email, username: current.username },
    newValues: input,
  });
  return getMember(actor, targetUserId);
}

async function uniqueUsername(email: string): Promise<string> {
  const base =
    (email.split('@')[0] ?? 'user')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 40) || 'user';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
    if (!(await orgs.usernameTaken(pool, candidate))) return candidate;
  }
  return `${base}-${randomBytes(6).toString('hex')}`;
}

/**
 * Adds a member. A new identity is created active (identity + membership in
 * one transaction). An existing identity gets an `invited` membership and is
 * not modified.
 */
export async function addMember(
  actor: Actor,
  input: { email: string; full_name: string; password: string; role: orgs.AssignableRole },
): Promise<{ member: Member; created: boolean }> {
  assertWithin(
    actor,
    input.role.grants,
    'You cannot assign a role with more privileges than your own',
  );

  const existingId = await orgs.findUserIdByEmail(pool, input.email);
  if (existingId !== null) {
    if (await orgs.findMember(pool, actor, existingId))
      throw AppError.conflict('This user is already a member of the organization');
    await orgs.insertMembership(pool, actor, {
      userId: existingId,
      roleId: input.role.id,
      status: 'invited',
      invitedBy: actor.userId,
    });
    await recordAuditEvent({
      action: 'MEMBER_INVITED',
      tableName: 'organization_memberships',
      recordId: existingId,
      newValues: { role: input.role.key },
    });
    return { member: await getMember(actor, existingId), created: false };
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const username = await uniqueUsername(input.email);
  let userId: number;
  try {
    userId = await withTransaction(pool, async (client) => {
      const id = await orgs.insertIdentity(client, {
        username,
        fullName: input.full_name,
        email: input.email,
        passwordHash,
      });
      await orgs.insertMembership(client, actor, {
        userId: id,
        roleId: input.role.id,
        status: 'active',
        invitedBy: actor.userId,
      });
      return id;
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505')
      throw AppError.conflict('A user with this email already exists');
    throw error;
  }
  await recordAuditEvent({
    action: 'MEMBER_CREATED',
    tableName: 'organization_memberships',
    recordId: userId,
    newValues: { email: input.email, role: input.role.key },
  });
  return { member: await getMember(actor, userId), created: true };
}

/** Organizations the user may switch to (active) or accept (invited). */
export async function myOrganizations(actor: Actor) {
  const memberships = await listMemberships(actor.userId);
  return memberships
    .filter((m) => m.status !== 'suspended' && m.organizationStatus === 'active')
    .map((m) => ({
      organization: {
        id: m.organizationPublicId,
        name: m.organizationName,
        slug: m.organizationSlug,
      },
      role: { key: m.roleKey, name: m.roleName },
      status: m.status,
      current: m.organizationId === actor.organizationId,
    }));
}

export async function acceptInvitation(
  userId: number,
  organizationPublicId: string,
): Promise<void> {
  const organizationId = await orgs.acceptInvitation(pool, organizationPublicId, userId);
  if (organizationId === null) throw AppError.notFound('Invitation not found');
  await recordAuditEvent({
    organizationId,
    action: 'INVITATION_ACCEPTED',
    tableName: 'organization_memberships',
    recordId: userId,
  });
}
