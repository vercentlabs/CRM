import type { Permission, RecordScope } from '@crm/permissions';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../http/errors.js';
import { setContextAuth } from '../request-context.js';
import { ACCESS_COOKIE, readCookie } from './cookies.js';
import { loadAuthSubject, type AuthSubject } from './repository.js';
import { verifyAccessToken, verifyCsrfToken } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Verified tenant identity; set by `authenticate`. */
      auth?: AuthSubject;
      /** How the access token arrived; cookie requests are CSRF-checked. */
      authTransport?: 'bearer' | 'cookie';
    }
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function extractToken(req: Request): { token: string; transport: 'bearer' | 'cookie' } | null {
  const header = req.headers.authorization;
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match?.[1] ? { token: match[1].trim(), transport: 'bearer' } : null;
  }
  const cookie = readCookie(req, ACCESS_COOKIE);
  return cookie ? { token: cookie, transport: 'cookie' } : null;
}

/**
 * Resolves the caller from a bearer or cookie access token and verifies the
 * session, user, membership and organization in the database. Pre-Phase-2
 * tokens (no session binding) are rejected. Cookie-authenticated unsafe
 * requests must echo the session CSRF token in `x-csrf-token`.
 */
export async function resolveAuth(req: Request): Promise<AuthSubject> {
  const extracted = extractToken(req);
  if (!extracted) throw AppError.unauthenticated('Authentication required');

  const claims = verifyAccessToken(extracted.token);
  if (!claims) throw AppError.unauthenticated('Invalid or expired token');

  const subject = await loadAuthSubject(claims.sid, Number(claims.sub), claims.org);
  if (!subject) throw AppError.unauthenticated('Invalid or expired token');

  if (
    extracted.transport === 'cookie' &&
    !SAFE_METHODS.has(req.method) &&
    !verifyCsrfToken(subject.sessionId, req.get('x-csrf-token'))
  ) {
    throw AppError.forbidden('Missing or invalid CSRF token');
  }

  req.auth = subject;
  req.authTransport = extracted.transport;
  setContextAuth({
    userId: subject.userId,
    sessionId: subject.sessionId,
    organizationId: subject.organizationId,
    organizationPublicId: subject.organizationPublicId,
    membershipId: subject.membershipId,
    roleKey: subject.roleKey,
    permissions: subject.permissions,
  });
  return subject;
}

/** authenticated → active membership (tenant context available as req.auth). */
export const authenticate: RequestHandler = (req, _res, next) => {
  resolveAuth(req).then(() => next(), next);
};

const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action';

/** Requires a permission (any scope). Responds 403 without revealing role details. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(AppError.unauthenticated());
    if (!req.auth.permissions.has(permission)) return next(AppError.forbidden(FORBIDDEN_MESSAGE));
    next();
  };
}

/** Requires organization-wide scope for a permission (e.g. assigning to others, org reports). */
export function requireScope(permission: Permission, scope: RecordScope): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(AppError.unauthenticated());
    const granted = req.auth.permissions.get(permission);
    if (!granted || (scope === 'organization' && granted !== 'organization')) {
      return next(AppError.forbidden(FORBIDDEN_MESSAGE));
    }
    next();
  };
}
