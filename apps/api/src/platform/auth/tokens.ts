import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';

const ISSUER = 'crm-api';
const AUDIENCE = 'crm';

/**
 * Access-token claims. `sid` binds the token to a server session and `org` to
 * the session's active organization; both are re-verified against the
 * database on every request, so a token alone never grants access.
 */
export interface AccessClaims {
  sub: string;
  sid: string;
  org: number;
  typ: 'access';
}

export function signAccessToken(input: {
  userId: number;
  sessionId: string;
  organizationId: number;
}) {
  const expiresInSeconds = env.ACCESS_TOKEN_TTL_SECONDS;
  const token = jwt.sign(
    { sid: input.sessionId, org: input.organizationId, typ: 'access' },
    env.JWT_SECRET,
    {
      algorithm: 'HS256',
      subject: String(input.userId),
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: expiresInSeconds,
    },
  );
  return { token, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
}

/** Returns null for anything that is not a valid, unexpired Phase 2 access token. */
export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof decoded !== 'object' || decoded === null) return null;
    const { sub, sid, org, typ } = decoded as Record<string, unknown>;
    if (typ !== 'access' || typeof sub !== 'string' || typeof sid !== 'string') return null;
    if (typeof org !== 'number' || !Number.isInteger(org) || !/^\d+$/.test(sub)) return null;
    return { sub, sid, org, typ };
  } catch {
    return null;
  }
}

/** 256-bit opaque refresh token; only its SHA-256 digest is ever persisted. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

const csrfKey = createHmac('sha256', env.JWT_SECRET).update('crm-csrf-v1').digest();

/** Stateless CSRF token bound to the session (double-submit via response body + header). */
export function csrfTokenFor(sessionId: string): string {
  return createHmac('sha256', csrfKey).update(sessionId).digest('base64url');
}

export function verifyCsrfToken(sessionId: string, presented: unknown): boolean {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  const expected = Buffer.from(csrfTokenFor(sessionId));
  const actual = Buffer.from(presented);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
