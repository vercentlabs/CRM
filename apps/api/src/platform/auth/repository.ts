import {
  isPermission,
  normalizeScope,
  type GrantMap,
  type Permission,
  type RecordScope,
} from '@crm/permissions';
import { pool } from '../db.js';

type Queryable = Pick<typeof pool, 'query'>;

export interface UserCredentials {
  id: number;
  email: string;
  passwordHash: string;
  isActive: boolean;
}

export interface MembershipRow {
  membershipId: number;
  organizationId: number;
  organizationPublicId: string;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: string;
  status: 'active' | 'invited' | 'suspended';
  roleKey: string;
  roleName: string;
}

/** Everything the API needs about the caller, verified in one query. */
export interface AuthSubject {
  sessionId: string;
  sessionExpiresAt: Date;
  userId: number;
  email: string;
  name: string;
  organizationId: number;
  organizationPublicId: string;
  organizationName: string;
  organizationSlug: string;
  membershipId: number;
  roleId: number;
  roleKey: string;
  roleName: string;
  permissions: GrantMap;
}

export function toGrantMap(rows: { permission: string; scope: string }[]): GrantMap {
  const map = new Map<Permission, RecordScope>();
  for (const row of rows) {
    if (isPermission(row.permission)) map.set(row.permission, normalizeScope(row.scope));
  }
  return map;
}

export async function findUserByEmail(email: string): Promise<UserCredentials | null> {
  const result = await pool.query(
    `SELECT id, email, password_hash, COALESCE(is_active, true) AS is_active
     FROM users WHERE lower(email) = lower($1)
     ORDER BY (email = $1) DESC, id
     LIMIT 1`,
    [email],
  );
  const row = result.rows[0];
  return row
    ? { id: row.id, email: row.email, passwordHash: row.password_hash, isActive: row.is_active }
    : null;
}

export async function listMemberships(
  userId: number,
  db: Queryable = pool,
): Promise<MembershipRow[]> {
  const result = await db.query(
    `SELECT m.id AS membership_id, m.status, o.id AS organization_id, o.public_id, o.name, o.slug,
            o.status AS organization_status, r.key AS role_key, r.name AS role_name
     FROM organization_memberships m
     JOIN organizations o ON o.id = m.organization_id
     JOIN roles r ON r.id = m.role_id
     WHERE m.user_id = $1
     ORDER BY m.created_at, m.id`,
    [userId],
  );
  return result.rows.map((row) => ({
    membershipId: row.membership_id,
    organizationId: row.organization_id,
    organizationPublicId: row.public_id,
    organizationName: row.name,
    organizationSlug: row.slug,
    organizationStatus: row.organization_status,
    status: row.status,
    roleKey: row.role_key,
    roleName: row.role_name,
  }));
}

export async function createSession(input: {
  userId: number;
  organizationId: number;
  client: 'web' | 'mobile' | 'api';
  userAgent: string | undefined;
  ttlDays: number;
  refreshTokenHash: string;
}): Promise<{ sessionId: string; expiresAt: Date }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = await client.query(
      `INSERT INTO auth_sessions (user_id, organization_id, client, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))
       RETURNING id, expires_at`,
      [
        input.userId,
        input.organizationId,
        input.client,
        input.userAgent ? input.userAgent.slice(0, 255) : null,
        input.ttlDays,
      ],
    );
    const { id, expires_at: expiresAt } = session.rows[0];
    await client.query(
      `INSERT INTO auth_refresh_tokens (session_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [id, input.refreshTokenHash, expiresAt],
    );
    await client.query('COMMIT');
    return { sessionId: id, expiresAt };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Loads and verifies the caller: live session, active user, active membership
 * in the session's organization, active organization, and role grants.
 */
export async function loadAuthSubject(
  sessionId: string,
  userId: number,
  organizationId: number,
): Promise<AuthSubject | null> {
  const result = await pool.query(
    `SELECT s.id AS session_id, s.expires_at,
            u.id AS user_id, u.email, COALESCE(u.full_name, u.username) AS name,
            o.id AS organization_id, o.public_id, o.name AS organization_name, o.slug,
            m.id AS membership_id,
            r.id AS role_id, r.key AS role_key, r.name AS role_name,
            COALESCE(
              json_agg(json_build_object('permission', rp.permission_key, 'scope', rp.scope))
                FILTER (WHERE rp.permission_key IS NOT NULL),
              '[]'::json
            ) AS grants
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN organizations o ON o.id = s.organization_id
     JOIN organization_memberships m ON m.organization_id = s.organization_id AND m.user_id = s.user_id
     JOIN roles r ON r.id = m.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     WHERE s.id = $1 AND s.user_id = $2 AND s.organization_id = $3
       AND s.revoked_at IS NULL AND s.expires_at > now()
       AND COALESCE(u.is_active, true) AND m.status = 'active' AND o.status = 'active'
     GROUP BY s.id, u.id, o.id, m.id, r.id`,
    [sessionId, userId, organizationId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    sessionExpiresAt: row.expires_at,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    organizationId: row.organization_id,
    organizationPublicId: row.public_id,
    organizationName: row.organization_name,
    organizationSlug: row.slug,
    membershipId: row.membership_id,
    roleId: row.role_id,
    roleKey: row.role_key,
    roleName: row.role_name,
    permissions: toGrantMap(row.grants),
  };
}

export type RotationResult =
  | {
      status: 'rotated';
      sessionId: string;
      userId: number;
      organizationId: number;
      client: string;
      expiresAt: Date;
    }
  | { status: 'invalid' }
  | { status: 'reused'; revoked: boolean };

/**
 * Rotates a refresh token atomically. A token that was already rotated is a
 * reuse: outside the grace window the whole session is revoked (theft
 * response); inside it (concurrent tabs) the request is simply rejected.
 */
export async function rotateRefreshToken(input: {
  presentedHash: string;
  newHash: string;
  graceSeconds: number;
}): Promise<RotationResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT t.id, t.rotated_at, t.expires_at, s.id AS session_id, s.user_id, s.organization_id,
              s.client, s.revoked_at, s.expires_at AS session_expires_at,
              (t.rotated_at IS NOT NULL AND t.rotated_at > now() - make_interval(secs => $2)) AS within_grace
       FROM auth_refresh_tokens t
       JOIN auth_sessions s ON s.id = t.session_id
       WHERE t.token_hash = $1
       FOR UPDATE OF t, s`,
      [input.presentedHash, input.graceSeconds],
    );
    const row = found.rows[0];
    if (
      !row ||
      row.revoked_at ||
      row.session_expires_at <= new Date() ||
      row.expires_at <= new Date()
    ) {
      await client.query('ROLLBACK');
      return { status: 'invalid' };
    }
    if (row.rotated_at) {
      if (row.within_grace) {
        await client.query('ROLLBACK');
        return { status: 'reused', revoked: false };
      }
      await client.query(
        `UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'refresh_token_reuse'
         WHERE id = $1 AND revoked_at IS NULL`,
        [row.session_id],
      );
      await client.query('COMMIT');
      return { status: 'reused', revoked: true };
    }
    await client.query(`UPDATE auth_refresh_tokens SET rotated_at = now() WHERE id = $1`, [row.id]);
    await client.query(
      `INSERT INTO auth_refresh_tokens (session_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [row.session_id, input.newHash, row.session_expires_at],
    );
    await client.query(`UPDATE auth_sessions SET last_used_at = now() WHERE id = $1`, [
      row.session_id,
    ]);
    await client.query('COMMIT');
    return {
      status: 'rotated',
      sessionId: row.session_id,
      userId: row.user_id,
      organizationId: row.organization_id,
      client: row.client,
      expiresAt: row.session_expires_at,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function findSessionByRefreshHash(hash: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT session_id FROM auth_refresh_tokens WHERE token_hash = $1`,
    [hash],
  );
  return result.rows[0]?.session_id ?? null;
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await pool.query(
    `UPDATE auth_sessions SET revoked_at = now(), revoked_reason = $2
     WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId, reason],
  );
}

/** Revokes every live session of a user, optionally only those bound to one organization. */
export async function revokeUserSessions(
  userId: number,
  reason: string,
  organizationId?: number,
  db: Queryable = pool,
): Promise<void> {
  await db.query(
    `UPDATE auth_sessions SET revoked_at = now(), revoked_reason = $2
     WHERE user_id = $1 AND revoked_at IS NULL AND ($3::int IS NULL OR organization_id = $3)`,
    [userId, reason, organizationId ?? null],
  );
}

export async function switchSessionOrganization(
  sessionId: string,
  organizationId: number,
): Promise<void> {
  await pool.query(
    `UPDATE auth_sessions SET organization_id = $2, last_used_at = now()
     WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId, organizationId],
  );
}
