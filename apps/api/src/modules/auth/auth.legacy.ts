import {
  forgotPasswordSchema,
  loginRequestSchema,
  resetPasswordSchema,
  toFieldIssues,
  verifyResetTokenSchema,
} from '@crm/validation';
import { Router, type RequestHandler } from 'express';
import type { z } from 'zod';
import * as sessions from '../../platform/auth/service.js';
import { AppError } from '../../platform/http/errors.js';
import { sendSuccess } from '../../platform/http/legacy-response.js';
import { validate } from '../../platform/http/route.js';
import { endPresentedSession, loginRateLimiter, passwordResetLimiter } from './auth.routes.js';
import * as passwords from './password.service.js';

/**
 * DEPRECATED `/auth/login|logout` for already-installed mobile builds (bearer
 * tokens in the historical `{ success, message, data }` envelope) and the
 * public password-reset endpoints under `/users/*`.
 */
export function legacyAuthRouter(): Router {
  const router = Router();

  router.post('/login', loginRateLimiter, async (req, res) => {
    const parsed = loginRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      throw AppError.validation(toFieldIssues(parsed.error), 'Validation failed');
    const issued = await sessions.login({
      email: parsed.data.email,
      password: parsed.data.password,
      client: 'mobile',
      userAgent: req.get('User-Agent'),
    });
    res.setHeader('Deprecation', 'true');
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, 'Login successful', {
      token: issued.accessToken,
      refreshToken: issued.refreshToken,
      expiresIn: Math.round((issued.accessTokenExpiresAt.getTime() - Date.now()) / 1000),
      user: {
        id: issued.subject.userId,
        email: issued.subject.email,
        roleId: issued.subject.legacyRoleId,
        name: issued.subject.name,
      },
    });
  });

  router.post('/logout', async (req, res) => {
    const failure = await endPresentedSession(req);
    if (failure) throw failure;
    res.setHeader('Deprecation', 'true');
    sendSuccess(res, 'Logout successful');
  });

  return router;
}

const GENERIC_RESET_RESPONSE = {
  success: true,
  message: 'If a user with that email exists, a password reset link has been sent',
};

function publicRoute<S extends z.ZodType>(
  body: S,
  handle: (input: z.output<S>, res: import('express').Response) => Promise<void>,
): RequestHandler[] {
  return [
    passwordResetLimiter,
    validate({ body }),
    async (req, res) => {
      res.setHeader('Deprecation', 'true');
      await handle(req.validated!.body as z.output<S>, res);
    },
  ];
}

/** Mounted under `/users` before the member adapters. */
export function legacyPasswordRouter(): Router {
  const router = Router();
  router.post(
    '/forgot-password',
    ...publicRoute(forgotPasswordSchema, async (input, res) => {
      await passwords.requestReset(input.email);
      res.status(200).json(GENERIC_RESET_RESPONSE);
    }),
  );
  router.post(
    '/reset-password',
    ...publicRoute(resetPasswordSchema, async (input, res) => {
      await passwords.resetPassword(input.token, input.newPassword);
      res.status(200).json({ success: true, message: 'Password has been reset successfully' });
    }),
  );
  router.post(
    '/verify-reset-token',
    ...publicRoute(verifyResetTokenSchema, async (input, res) => {
      await passwords.verifyResetToken(input.token);
      res.status(200).json({ success: true, message: 'Token is valid' });
    }),
  );
  return router;
}
