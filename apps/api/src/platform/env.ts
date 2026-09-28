import dotenv from 'dotenv';
import { booleanString, nodeEnvSchema, parseEnv } from '@crm/config';
import { z } from 'zod';

// Tests provide an explicit environment; never let a developer's local .env leak in.
if (process.env.NODE_ENV !== 'test') dotenv.config({ quiet: true });

const optional = z.string().optional();

/**
 * Environment contract for the API. Imported first by server.js so the process
 * fails fast with a readable list of missing keys (values are never printed).
 *
 * IMAGEKIT_* and PLIVO_AUTH_* are required because their SDK clients are
 * constructed at import time and already crash the process when missing.
 */
const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    PORT: z.coerce.number().int().positive().default(5000),

    DATABASE_URL: z.string(),

    JWT_SECRET: z.string(),
    /** Access-token lifetime. Short by design; clients refresh with a rotating refresh token. */
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    /** Absolute session lifetime; refresh tokens never outlive their session. */
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Concurrent refreshes (e.g. two browser tabs) within this window are not treated as token theft. */
    REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(120).default(10),

    /** Browser origins allowed to send credentialed (cookie) requests. Comma separated. */
    CORS_ORIGINS: optional,
    AUTH_COOKIE_SECURE: booleanString.optional(),
    AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    AUTH_COOKIE_DOMAIN: optional,
    /** Set when running behind a reverse proxy so req.ip is the client address (e.g. "1" or "loopback"). */
    TRUST_PROXY: optional,

    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),

    FRONTEND_URL: optional,

    IMAGEKIT_PUBLIC_KEY: z.string(),
    IMAGEKIT_PRIVATE_KEY: z.string(),
    IMAGEKIT_URL_ENDPOINT: z.string(),

    PLIVO_AUTH_ID: z.string(),
    PLIVO_AUTH_TOKEN: z.string(),
    PLIVO_PHONE_NUMBER: optional,
    /** Public base URL of the Plivo webhooks (…/api/plivo/webhook); required to verify signatures. */
    PLIVO_WEBHOOK_URL: optional,

    EMAIL_HOST: optional,
    EMAIL_PORT: optional,
    EMAIL_SECURE: optional,
    EMAIL_USER: optional,
    EMAIL_PASS: optional,
    EMAIL_FROM: optional,

    GOLD_API_KEY: optional,
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_COOKIE_SAMESITE === 'none' && env.AUTH_COOKIE_SECURE === false) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SAMESITE'],
        message: 'SameSite=None cookies require AUTH_COOKIE_SECURE=true',
      });
    }
  });

export type ApiEnv = z.output<typeof apiEnvSchema>;

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const env = parseEnv(apiEnvSchema, { appName: 'api', source });
  if (env.NODE_ENV === 'production' && env.JWT_SECRET.length < 32) {
    // Warn rather than fail so existing deployments keep booting; Phase 7 makes this fatal.
    console.warn(
      '[api] JWT_SECRET is shorter than 32 characters; rotate it to a long random value.',
    );
  }
  return env;
}

export const env: ApiEnv = loadApiEnv();

/** Cookies are Secure in production unless explicitly overridden. */
export const cookieSecure = env.AUTH_COOKIE_SECURE ?? env.NODE_ENV === 'production';

/** Allow-list for credentialed CORS: CORS_ORIGINS, else FRONTEND_URL. */
export const credentialedOrigins: ReadonlySet<string> = new Set(
  (env.CORS_ORIGINS ?? env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
);
