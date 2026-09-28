import type { CookieOptions, Request, Response } from 'express';
import { cookieSecure, env } from '../env.js';

export const ACCESS_COOKIE = 'crm_at';
export const REFRESH_COOKIE = 'crm_rt';
/** The refresh cookie is only ever sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: env.AUTH_COOKIE_SAMESITE,
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {}),
  };
}

export function setAuthCookies(
  res: Response,
  tokens: {
    accessToken: string;
    accessTokenExpiresAt: Date;
    refreshToken?: string;
    sessionExpiresAt: Date;
  },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(),
    path: '/',
    maxAge: Math.max(0, tokens.accessTokenExpiresAt.getTime() - Date.now()),
  });
  if (tokens.refreshToken) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...baseOptions(),
      path: REFRESH_COOKIE_PATH,
      maxAge: Math.max(0, tokens.sessionExpiresAt.getTime() - Date.now()),
    });
  }
  res.setHeader('Cache-Control', 'no-store');
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(), path: REFRESH_COOKIE_PATH });
}

/** Minimal Cookie header parser (avoids a dependency for two cookies). */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      const raw = part.slice(index + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}
