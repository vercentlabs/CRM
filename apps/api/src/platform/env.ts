import dotenv from 'dotenv';
import { booleanString, nodeEnvSchema, parseEnv } from '@crm/config';
import { z } from 'zod';

// Tests provide an explicit environment; never let a developer's local .env leak in.
if (process.env.NODE_ENV !== 'test') dotenv.config({ quiet: true });

const optional = z.string().optional();
const int = (min: number, fallback: number) => z.coerce.number().int().min(min).default(fallback);

/** localhost or a single-label host (e.g. a compose/private-network service name). */
const isPrivateDatabaseHost = (url: string) => {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || !host.includes('.');
  } catch {
    return false;
  }
};

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Environment contract for the API. Imported first by server.ts so the process
 * fails fast with a readable list of problems (values are never printed).
 * In production, unsafe configuration is fatal (see superRefine below);
 * optional providers that are not configured stay optional.
 */
const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    PORT: z.coerce.number().int().positive().default(5000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    /** Requests slower than this are logged as `http_request_slow` (warn). */
    SLOW_REQUEST_MS: int(1, 1000),
    /** Bearer token for GET /metrics. Unset = endpoint disabled (404). */
    METRICS_TOKEN: optional,
    /** Maximum JSON / form body size (uploads are limited separately). */
    BODY_LIMIT: z
      .string()
      .regex(/^\d+(kb|mb)$/)
      .default('1mb'),

    DATABASE_URL: z.string(),
    /** disable | require (TLS, no certificate check) | verify (TLS + certificate check). */
    DATABASE_SSL: z.enum(['disable', 'require', 'verify']).optional(),
    /** PEM CA bundle for DATABASE_SSL=verify when the provider uses a private CA. */
    DATABASE_SSL_CA: optional,
    DATABASE_POOL_MAX: int(1, 20),

    /** Shared store for rate limits (required in production; rediss:// supported). */
    REDIS_URL: optional,
    RATE_LIMIT_PREFIX: z
      .string()
      .regex(/^[a-z0-9_-]{1,32}$/)
      .default('crm'),

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

    /** Login: attempts per (IP, email) per window, and per IP across all emails. */
    AUTH_RATE_LIMIT_MAX: int(1, 10),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: int(1, 900),
    AUTH_RATE_LIMIT_IP_MAX: int(1, 100),
    /** Sensitive writes (member management, uploads, messaging, webhooks) per user per minute. */
    SENSITIVE_RATE_LIMIT_PER_MINUTE: int(1, 60),

    FRONTEND_URL: optional,

    /** 'memory' keeps uploads in process (development/tests only; refused in production). */
    STORAGE_PROVIDER: z.enum(['imagekit', 'memory']).default('imagekit'),
    IMAGEKIT_PUBLIC_KEY: z.string(),
    IMAGEKIT_PRIVATE_KEY: z.string(),
    IMAGEKIT_URL_ENDPOINT: z.string(),
    /** Lifetime of signed file access URLs. */
    FILE_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(600),

    PLIVO_AUTH_ID: z.string(),
    PLIVO_AUTH_TOKEN: z.string(),
    PLIVO_PHONE_NUMBER: optional,
    /** Public base URL of the Plivo webhooks (…/api/plivo/webhook); required to verify signatures. */
    PLIVO_WEBHOOK_URL: optional,

    /** 32-byte key (base64/hex) encrypting outbound webhook secrets. Unset = webhook management disabled. */
    WEBHOOK_SECRET_KEY: optional,
    /** Development only: allow http:// and private-network webhook targets. */
    WEBHOOK_ALLOW_PRIVATE_TARGETS: booleanString.optional(),

    EMAIL_HOST: optional,
    EMAIL_PORT: optional,
    EMAIL_SECURE: optional,
    EMAIL_USER: optional,
    EMAIL_PASS: optional,
    EMAIL_FROM: optional,

    GOLD_API_KEY: optional,

    APP_VERSION: optional,
    GIT_SHA: optional,
    BUILD_TIME: optional,
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (env.AUTH_COOKIE_SAMESITE === 'none' && env.AUTH_COOKIE_SECURE === false) {
      issue('AUTH_COOKIE_SAMESITE', 'SameSite=None cookies require AUTH_COOKIE_SECURE=true');
    }
    if (
      env.WEBHOOK_SECRET_KEY &&
      !/^([0-9a-f]{64}|[A-Za-z0-9+/]{43}=?)$/i.test(env.WEBHOOK_SECRET_KEY)
    ) {
      issue('WEBHOOK_SECRET_KEY', 'Must be 32 bytes, base64 or hex');
    }
    if (env.PLIVO_WEBHOOK_URL) {
      try {
        const url = new URL(env.PLIVO_WEBHOOK_URL);
        if (!/\/webhook\/?$/.test(url.pathname) || url.search || url.hash) {
          issue('PLIVO_WEBHOOK_URL', 'Must be the public URL of …/api/plivo/webhook (no query)');
        }
      } catch {
        issue('PLIVO_WEBHOOK_URL', 'Must be an absolute URL');
      }
    }
    if (env.NODE_ENV !== 'production') return;

    // ---------------- production guards (fatal) ----------------
    if (env.JWT_SECRET.length < 32)
      issue('JWT_SECRET', 'Must be at least 32 random characters in production');
    if (env.AUTH_COOKIE_SECURE === false)
      issue('AUTH_COOKIE_SECURE', 'Cookies must be Secure in production');
    const origins = (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    if (origins.length === 0)
      issue('CORS_ORIGINS', 'An explicit browser origin allow-list is required in production');
    if (origins.some((o) => o === '*' || !isHttpsUrl(o))) {
      issue('CORS_ORIGINS', 'Origins must be explicit https:// origins (no wildcard)');
    }
    if (env.FRONTEND_URL && !isHttpsUrl(env.FRONTEND_URL))
      issue('FRONTEND_URL', 'Must use https in production');
    if (!env.REDIS_URL) issue('REDIS_URL', 'Required in production for shared rate limiting');
    if (env.STORAGE_PROVIDER === 'memory')
      issue('STORAGE_PROVIDER', 'In-memory storage is for development and tests only');
    if (env.WEBHOOK_ALLOW_PRIVATE_TARGETS) {
      issue(
        'WEBHOOK_ALLOW_PRIVATE_TARGETS',
        'Private webhook targets are never allowed in production',
      );
    }
    if (env.DATABASE_SSL === 'disable' && !isPrivateDatabaseHost(env.DATABASE_URL)) {
      issue('DATABASE_SSL', 'TLS must not be disabled for a remote production database');
    }
    if (env.PLIVO_WEBHOOK_URL && !isHttpsUrl(env.PLIVO_WEBHOOK_URL))
      issue('PLIVO_WEBHOOK_URL', 'Must use https in production');
    if (env.METRICS_TOKEN !== undefined && env.METRICS_TOKEN.length < 24) {
      issue('METRICS_TOKEN', 'Must be at least 24 characters');
    }
    if (/^(test|changeme|placeholder|x)$/i.test(env.PLIVO_AUTH_TOKEN) && env.PLIVO_PHONE_NUMBER) {
      issue('PLIVO_AUTH_TOKEN', 'Looks like a placeholder while calling is configured');
    }
  });

export type ApiEnv = z.output<typeof apiEnvSchema>;

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, { appName: 'api', source });
}

export const env: ApiEnv = loadApiEnv();

/** Cookies are Secure in production unless explicitly overridden (refused in production). */
export const cookieSecure = env.AUTH_COOKIE_SECURE ?? env.NODE_ENV === 'production';

/** Allow-list for credentialed CORS: CORS_ORIGINS, else FRONTEND_URL (development only). */
export const credentialedOrigins: ReadonlySet<string> = new Set(
  (env.CORS_ORIGINS ?? (env.NODE_ENV === 'production' ? '' : (env.FRONTEND_URL ?? '')))
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
);

/** TLS settings for pg: production defaults to verified TLS; development/test to none. */
export function databaseSsl(): false | { rejectUnauthorized: boolean; ca?: string } {
  const mode = env.DATABASE_SSL ?? (env.NODE_ENV === 'production' ? 'verify' : 'disable');
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}) };
}
