import bcrypt from 'bcrypt';
import type { Permission, RecordScope } from '@crm/permissions';
import type { AuthSessionView, MembershipSummary } from '@crm/types';
import { env } from '../env.js';
import { AppError } from '../http/errors.js';
import { recordAuditEvent } from '../audit.js';
import {
  createSession,
  findSessionByRefreshHash,
  findUserByEmail,
  listMemberships,
  loadAuthSubject,
  revokeSession,
  rotateRefreshToken,
  switchSessionOrganization,
  type AuthSubject,
  type MembershipRow,
} from './repository.js';
import { csrfTokenFor, generateRefreshToken, hashRefreshToken, signAccessToken } from './tokens.js';

export type ClientKind = 'web' | 'mobile' | 'api';

/** Pre-computed hash so unknown emails cost the same bcrypt time as known ones. */
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-password', 10);

const INVALID_CREDENTIALS = 'Invalid email or password';

export interface IssuedSession {
  subject: AuthSubject;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken?: string;
  memberships: MembershipRow[];
}

function membershipSummary(row: MembershipRow): MembershipSummary {
  return {
    organization: {
      id: row.organizationPublicId,
      name: row.organizationName,
      slug: row.organizationSlug,
    },
    role: { key: row.roleKey, name: row.roleName },
    status: row.status,
  };
}

export function sessionView(
  issued: Pick<IssuedSession, 'subject' | 'accessTokenExpiresAt' | 'memberships'>,
  options: { includeCsrf: boolean; accessToken?: string; refreshToken?: string },
): AuthSessionView {
  const { subject } = issued;
  const permissions: Partial<Record<Permission, RecordScope>> = Object.fromEntries(
    subject.permissions,
  );
  return {
    user: {
      id: subject.userId,
      email: subject.email,
      name: subject.name,
    },
    organization: {
      id: subject.organizationPublicId,
      name: subject.organizationName,
      slug: subject.organizationSlug,
    },
    membership: {
      id: subject.membershipId,
      role: { key: subject.roleKey, name: subject.roleName },
    },
    permissions,
    organizations: issued.memberships
      .filter((m) => m.status !== 'suspended' && m.organizationStatus === 'active')
      .map(membershipSummary),
    accessTokenExpiresAt: issued.accessTokenExpiresAt.toISOString(),
    sessionExpiresAt: subject.sessionExpiresAt.toISOString(),
    ...(options.includeCsrf ? { csrfToken: csrfTokenFor(subject.sessionId) } : {}),
    ...(options.accessToken ? { accessToken: options.accessToken } : {}),
    ...(options.refreshToken ? { refreshToken: options.refreshToken } : {}),
  };
}

async function issueAccess(subject: AuthSubject) {
  const access = signAccessToken({
    userId: subject.userId,
    sessionId: subject.sessionId,
    organizationId: subject.organizationId,
  });
  return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt };
}

/**
 * Password login. Every failure before the password is proven returns the same
 * generic 401. Disabled users and users without an active membership also get
 * the generic 401 (reason goes to the audit log only).
 */
export async function login(input: {
  email: string;
  password: string;
  organizationPublicId?: string | undefined;
  client: ClientKind;
  userAgent: string | undefined;
}): Promise<IssuedSession> {
  const user = await findUserByEmail(input.email);
  const passwordOk = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk) {
    await recordAuditEvent({
      organizationId: null,
      userId: user?.id ?? null,
      action: 'LOGIN_FAILED',
      tableName: 'users',
      recordId: user?.id ?? null,
      newValues: { reason: 'invalid_credentials' },
    });
    throw AppError.unauthenticated(INVALID_CREDENTIALS);
  }

  const memberships = await listMemberships(user.id);
  const usable = memberships.filter(
    (m) => m.status === 'active' && m.organizationStatus === 'active',
  );

  if (!user.isActive || usable.length === 0) {
    await recordAuditEvent({
      organizationId: null,
      userId: user.id,
      action: 'LOGIN_FAILED',
      tableName: 'users',
      recordId: user.id,
      newValues: { reason: user.isActive ? 'no_active_membership' : 'user_disabled' },
    });
    throw AppError.unauthenticated(INVALID_CREDENTIALS);
  }

  let membership = usable[0]!;
  if (input.organizationPublicId) {
    const requested = usable.find((m) => m.organizationPublicId === input.organizationPublicId);
    if (!requested) throw AppError.forbidden('You do not have access to this organization');
    membership = requested;
  }

  const refreshToken = generateRefreshToken();
  const { sessionId } = await createSession({
    userId: user.id,
    organizationId: membership.organizationId,
    client: input.client,
    userAgent: input.userAgent,
    ttlDays: env.SESSION_TTL_DAYS,
    refreshTokenHash: hashRefreshToken(refreshToken),
  });

  const subject = await loadAuthSubject(sessionId, user.id, membership.organizationId);
  if (!subject) throw AppError.unauthenticated(INVALID_CREDENTIALS);

  await recordAuditEvent({
    organizationId: subject.organizationId,
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    tableName: 'users',
    recordId: user.id,
    newValues: { client: input.client, sessionId },
  });

  return { subject, ...(await issueAccess(subject)), refreshToken, memberships };
}

/** Exchanges a refresh token for a new access token and a new refresh token. */
export async function refresh(presented: string): Promise<IssuedSession> {
  const newRefreshToken = generateRefreshToken();
  const result = await rotateRefreshToken({
    presentedHash: hashRefreshToken(presented),
    newHash: hashRefreshToken(newRefreshToken),
    graceSeconds: env.REFRESH_REUSE_GRACE_SECONDS,
  });

  if (result.status === 'reused' && result.revoked) {
    await recordAuditEvent({
      organizationId: null,
      userId: null,
      action: 'REFRESH_TOKEN_REUSE',
      tableName: 'auth_sessions',
      recordId: null,
      newValues: { sessionRevoked: true },
    });
  }
  if (result.status !== 'rotated')
    throw AppError.unauthenticated('Session expired, please sign in again');

  const subject = await loadAuthSubject(result.sessionId, result.userId, result.organizationId);
  if (!subject) {
    // Membership, user or organization was disabled since login: end the session.
    await revokeSession(result.sessionId, 'access_revoked');
    throw AppError.unauthenticated('Session expired, please sign in again');
  }
  const memberships = await listMemberships(subject.userId);
  return { subject, ...(await issueAccess(subject)), refreshToken: newRefreshToken, memberships };
}

export async function logout(
  sessionId: string,
  userId: number | null,
  organizationId: number | null,
) {
  await revokeSession(sessionId, 'logout');
  await recordAuditEvent({
    organizationId,
    userId,
    action: 'LOGOUT',
    tableName: 'auth_sessions',
    recordId: null,
    newValues: { sessionId },
  });
}

export async function logoutByRefreshToken(presented: string): Promise<void> {
  const sessionId = await findSessionByRefreshHash(hashRefreshToken(presented));
  if (sessionId) await logout(sessionId, null, null);
}

export async function currentSession(subject: AuthSubject): Promise<IssuedSession> {
  const memberships = await listMemberships(subject.userId);
  return { subject, ...(await issueAccess(subject)), memberships };
}

/** Moves the session to another organization after verifying an active membership. */
export async function switchOrganization(
  subject: AuthSubject,
  organizationPublicId: string,
): Promise<IssuedSession> {
  const memberships = await listMemberships(subject.userId);
  const target = memberships.find(
    (m) =>
      m.organizationPublicId === organizationPublicId &&
      m.status === 'active' &&
      m.organizationStatus === 'active',
  );
  // Same response whether the organization does not exist or the user is not a member.
  if (!target) throw AppError.forbidden('You do not have access to this organization');

  await switchSessionOrganization(subject.sessionId, target.organizationId);
  const next = await loadAuthSubject(subject.sessionId, subject.userId, target.organizationId);
  if (!next) throw AppError.forbidden('You do not have access to this organization');

  await recordAuditEvent({
    organizationId: next.organizationId,
    userId: next.userId,
    action: 'SWITCH_ORGANIZATION',
    tableName: 'auth_sessions',
    recordId: null,
    newValues: { from: subject.organizationPublicId, to: next.organizationPublicId },
  });
  return { subject: next, ...(await issueAccess(next)), memberships };
}
