import { loginRequestSchema, toFieldIssues } from '@crm/validation';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { AppError } from '../http/errors.js';
import { sendData } from '../http/respond.js';
import { createRateLimiter, emailKey } from '../rate-limit.js';
import { clearAuthCookies, readCookie, REFRESH_COOKIE, setAuthCookies } from './cookies.js';
import { authenticate, resolveAuth } from './middleware.js';
import {
  currentSession,
  login,
  logout,
  logoutByRefreshToken,
  refresh,
  sessionView,
  switchOrganization,
  type IssuedSession,
} from './service.js';

export const loginRateLimiter = createRateLimiter({
  name: 'login',
  max: env.AUTH_RATE_LIMIT_MAX,
  windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
  key: emailKey,
});

export const refreshRateLimiter = createRateLimiter({
  name: 'refresh',
  max: env.AUTH_RATE_LIMIT_MAX * 6,
  windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
});

const v1LoginSchema = loginRequestSchema.extend({
  organizationId: z.uuid().optional(),
  client: z.enum(['web', 'mobile']).optional(),
});

const switchSchema = z.object({ organizationId: z.uuid() });

type Delivery = 'cookie' | 'body';

/** Cookie delivery never exposes tokens to JavaScript; body delivery is for native/API clients. */
export function respondWithSession(
  res: Response,
  issued: IssuedSession,
  delivery: Delivery,
  status = 200,
) {
  if (delivery === 'cookie') {
    setAuthCookies(res, {
      accessToken: issued.accessToken,
      accessTokenExpiresAt: issued.accessTokenExpiresAt,
      ...(issued.refreshToken ? { refreshToken: issued.refreshToken } : {}),
      sessionExpiresAt: issued.subject.sessionExpiresAt,
    });
    return sendData(res, sessionView(issued, { includeCsrf: true }), { status });
  }
  res.setHeader('Cache-Control', 'no-store');
  return sendData(
    res,
    sessionView(issued, {
      includeCsrf: false,
      accessToken: issued.accessToken,
      ...(issued.refreshToken ? { refreshToken: issued.refreshToken } : {}),
    }),
    { status },
  );
}

function presentedRefreshToken(req: Request): { token: string; delivery: Delivery } | null {
  const bodyToken = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  if (typeof bodyToken === 'string' && bodyToken.length > 0)
    return { token: bodyToken, delivery: 'body' };
  const cookieToken = readCookie(req, REFRESH_COOKIE);
  return cookieToken ? { token: cookieToken, delivery: 'cookie' } : null;
}

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/login', loginRateLimiter, async (req, res) => {
    const parsed = v1LoginSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw AppError.validation(toFieldIssues(parsed.error));
    const client = parsed.data.client ?? 'web';
    const issued = await login({
      email: parsed.data.email,
      password: parsed.data.password,
      organizationPublicId: parsed.data.organizationId,
      client,
      userAgent: req.get('user-agent'),
    });
    respondWithSession(res, issued, client === 'web' ? 'cookie' : 'body');
  });

  router.post('/refresh', refreshRateLimiter, async (req, res) => {
    const presented = presentedRefreshToken(req);
    if (!presented) throw AppError.unauthenticated('Refresh token required');
    try {
      const issued = await refresh(presented.token);
      respondWithSession(res, issued, presented.delivery);
    } catch (error) {
      if (presented.delivery === 'cookie') clearAuthCookies(res);
      throw error;
    }
  });

  router.post('/logout', async (req, res) => {
    try {
      const subject = await resolveAuth(req);
      await logout(subject.sessionId, subject.userId, subject.organizationId);
    } catch (error) {
      // A cookie request without its CSRF token must not be able to log the user out.
      if (error instanceof AppError && error.code === 'FORBIDDEN') throw error;
      const presented = presentedRefreshToken(req);
      if (presented) await logoutByRefreshToken(presented.token);
    }
    clearAuthCookies(res);
    sendData(res, { loggedOut: true });
  });

  router.get('/session', authenticate, async (req, res) => {
    const issued = await currentSession(req.auth!);
    res.setHeader('Cache-Control', 'no-store');
    if (req.authTransport === 'cookie') {
      // Re-issue the access cookie so an active tab keeps a fresh token.
      return respondWithSession(res, issued, 'cookie');
    }
    sendData(res, sessionView(issued, { includeCsrf: false }));
  });

  router.post('/switch-organization', authenticate, async (req, res) => {
    const parsed = switchSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw AppError.validation(toFieldIssues(parsed.error));
    const issued = await switchOrganization(req.auth!, parsed.data.organizationId);
    respondWithSession(res, issued, req.authTransport === 'cookie' ? 'cookie' : 'body');
  });

  return router;
}
