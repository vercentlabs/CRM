import {
  forgotPasswordSchema,
  loginRequestSchema,
  resetPasswordSchema,
  verifyResetTokenSchema,
} from '@crm/validation';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  clearAuthCookies,
  readCookie,
  REFRESH_COOKIE,
  setAuthCookies,
} from '../../platform/auth/cookies.js';
import { resolveAuth } from '../../platform/auth/middleware.js';
import * as sessions from '../../platform/auth/service.js';
import { AppError } from '../../platform/http/errors.js';
import { sendData } from '../../platform/http/respond.js';
import { controller, ok, type ApiModule } from '../../platform/http/route.js';
import { policies, rateLimit } from '../../platform/rate-limit.js';
import * as passwords from './password.service.js';

/**
 * Authentication endpoints. Session mechanics (tokens, refresh rotation,
 * reuse detection, CSRF, membership revalidation) live in platform/auth and
 * are unchanged; this module only exposes them. Auth bodies are camelCase
 * (Phase 2 contract).
 */

const loginLimit = rateLimit(policies.loginAccount, policies.loginIp);
const refreshLimit = rateLimit(policies.refresh);
const passwordResetLimit = rateLimit(policies.passwordReset, policies.passwordResetIp);

type Delivery = 'cookie' | 'body';

/** Cookie delivery never exposes tokens to JavaScript; body delivery is for native/API clients. */
export function respondWithSession(
  res: Response,
  issued: sessions.IssuedSession,
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
    return sendData(res, sessions.sessionView(issued, { includeCsrf: true }), { status });
  }
  res.setHeader('Cache-Control', 'no-store');
  return sendData(
    res,
    sessions.sessionView(issued, {
      includeCsrf: false,
      accessToken: issued.accessToken,
      ...(issued.refreshToken ? { refreshToken: issued.refreshToken } : {}),
    }),
    { status },
  );
}

export function presentedRefreshToken(req: Request): { token: string; delivery: Delivery } | null {
  const bodyToken = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  if (typeof bodyToken === 'string' && bodyToken.length > 0)
    return { token: bodyToken, delivery: 'body' };
  const cookieToken = readCookie(req, REFRESH_COOKIE);
  return cookieToken ? { token: cookieToken, delivery: 'cookie' } : null;
}

/**
 * Ends the presented session: access token first, refresh token when the
 * access token expired. Returns the authentication error when nothing was
 * presented (callers decide whether that is an error).
 */
export async function endPresentedSession(req: Request): Promise<unknown> {
  try {
    const subject = await resolveAuth(req);
    await sessions.logout(subject.sessionId, subject.userId, subject.organizationId);
    return null;
  } catch (error) {
    // A cookie request without its CSRF token must not be able to log the user out.
    if (error instanceof AppError && error.code === 'FORBIDDEN') throw error;
    const presented = presentedRefreshToken(req);
    if (!presented) return error;
    await sessions.logoutByRefreshToken(presented.token);
    return null;
  }
}

const loginBody = loginRequestSchema.extend({
  organizationId: z.uuid().optional(),
  client: z.enum(['web', 'mobile']).optional(),
});

const login = controller({
  body: loginBody,
  handle: async ({ body, req, res }) => {
    const client = body.client ?? 'web';
    const issued = await sessions.login({
      email: body.email,
      password: body.password,
      organizationPublicId: body.organizationId,
      client,
      userAgent: req.get('user-agent'),
    });
    respondWithSession(res, issued, client === 'web' ? 'cookie' : 'body');
    return undefined;
  },
});

const refresh = controller({
  handle: async ({ req, res }) => {
    const presented = presentedRefreshToken(req);
    if (!presented) throw AppError.unauthenticated('Refresh token required');
    try {
      respondWithSession(res, await sessions.refresh(presented.token), presented.delivery);
    } catch (error) {
      if (presented.delivery === 'cookie') clearAuthCookies(res);
      throw error;
    }
    return undefined;
  },
});

const logout = controller({
  handle: async ({ req, res }) => {
    await endPresentedSession(req); // idempotent: nothing presented is fine
    clearAuthCookies(res);
    return ok({ loggedOut: true });
  },
});

const session = controller({
  handle: async ({ auth, req, res }) => {
    const issued = await sessions.currentSession(auth);
    res.setHeader('Cache-Control', 'no-store');
    // Cookie clients get a fresh access cookie so an active tab stays signed in.
    if (req.authTransport === 'cookie') respondWithSession(res, issued, 'cookie');
    else sendData(res, sessions.sessionView(issued, { includeCsrf: false }));
    return undefined;
  },
});

const switchOrganization = controller({
  body: z.object({ organizationId: z.uuid() }),
  handle: async ({ auth, body, req, res }) => {
    const issued = await sessions.switchOrganization(auth, body.organizationId);
    respondWithSession(res, issued, req.authTransport === 'cookie' ? 'cookie' : 'body');
    return undefined;
  },
});

const forgotPassword = controller({
  body: forgotPasswordSchema,
  handle: async ({ body }) => {
    await passwords.requestReset(body.email);
    return ok({ requested: true });
  },
});

const resetPassword = controller({
  body: resetPasswordSchema,
  handle: async ({ body }) => {
    await passwords.resetPassword(body.token, body.newPassword);
    return ok({ reset: true });
  },
});

const verifyResetToken = controller({
  body: verifyResetTokenSchema,
  handle: async ({ body }) => {
    await passwords.verifyResetToken(body.token);
    return ok({ valid: true });
  },
});

const sessionSchema = z.object({
  user: z.object({
    id: z.number(),
    email: z.string(),
    name: z.string(),
  }),
  organization: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    timezone: z.string(),
  }),
  membership: z.object({ id: z.number(), role: z.object({ key: z.string(), name: z.string() }) }),
  permissions: z.record(z.string(), z.enum(['own', 'organization'])),
  organizations: z.array(z.unknown()),
  accessTokenExpiresAt: z.string(),
  sessionExpiresAt: z.string(),
  csrfToken: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
});

const tags = ['Auth'];

export const authModule: ApiModule = {
  name: 'auth',
  routes: [
    {
      method: 'post',
      path: '/auth/login',
      summary: "Sign in ('web' → HttpOnly cookies, 'mobile' → tokens in body)",
      tags,
      auth: 'public',
      before: [loginLimit],
      controller: login,
      response: sessionSchema,
    },
    {
      method: 'post',
      path: '/auth/refresh',
      summary: 'Rotate the refresh token (cookie or body `refreshToken`)',
      tags,
      auth: 'public',
      before: [refreshLimit],
      controller: refresh,
      response: sessionSchema,
    },
    {
      method: 'post',
      path: '/auth/logout',
      summary: 'Revoke the current session',
      tags,
      auth: 'public',
      controller: logout,
      response: z.object({ loggedOut: z.literal(true) }),
    },
    {
      method: 'get',
      path: '/auth/session',
      summary: 'The current session (revalidated)',
      tags,
      controller: session,
      response: sessionSchema,
    },
    {
      method: 'post',
      path: '/auth/switch-organization',
      summary: 'Switch the active organization (new session)',
      tags,
      controller: switchOrganization,
      response: sessionSchema,
    },
    {
      method: 'post',
      path: '/auth/password/forgot',
      summary: 'Request a reset link (never reveals whether the email exists)',
      tags,
      auth: 'public',
      before: [passwordResetLimit],
      controller: forgotPassword,
      response: z.object({ requested: z.literal(true) }),
    },
    {
      method: 'post',
      path: '/auth/password/reset',
      summary: 'Reset the password with a token (revokes all sessions)',
      tags,
      auth: 'public',
      before: [passwordResetLimit],
      controller: resetPassword,
      response: z.object({ reset: z.literal(true) }),
    },
    {
      method: 'post',
      path: '/auth/password/verify',
      summary: 'Check a reset token',
      tags,
      auth: 'public',
      before: [passwordResetLimit],
      controller: verifyResetToken,
      response: z.object({ valid: z.literal(true) }),
    },
  ],
};
