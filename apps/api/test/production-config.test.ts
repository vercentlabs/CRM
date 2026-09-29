import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApiEnv } from '../src/platform/env.js';

/**
 * Production configuration: fatal startup guards (pure env parsing) and the
 * behaviour of a production-mode app (fresh module graph with NODE_ENV=production):
 * security headers, CORS allow-list, cookie attributes and /metrics protection.
 */

const METRICS_TOKEN = 'metrics-token-for-tests-0123456789';

const productionEnv = (): Record<string, string> => ({
  NODE_ENV: 'production',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://crm:crm@127.0.0.1:1/crm_test',
  DATABASE_SSL: 'disable',
  JWT_SECRET: 'p'.repeat(48),
  CORS_ORIGINS: 'https://app.crm.example.com',
  FRONTEND_URL: 'https://app.crm.example.com',
  REDIS_URL: process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:1',
  STORAGE_PROVIDER: 'imagekit',
  IMAGEKIT_PUBLIC_KEY: 'public_x',
  IMAGEKIT_PRIVATE_KEY: 'private_x',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/x',
  PLIVO_AUTH_ID: 'MAXXXXXXXXXXXXXXXXXX',
  PLIVO_AUTH_TOKEN: 'not-a-real-token-but-not-a-placeholder',
  PLIVO_WEBHOOK_URL: 'https://api.crm.example.com/api/plivo/webhook',
  METRICS_TOKEN,
  WEBHOOK_SECRET_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  LOG_LEVEL: 'error',
  APP_VERSION: '1.0.0',
  GIT_SHA: 'abcdef0123456789abcdef0123456789abcdef01',
});

describe('production startup guards', () => {
  it('accepts a safe production configuration', () => {
    expect(() => loadApiEnv(productionEnv())).not.toThrow();
  });

  const unsafe: Array<[string, Record<string, string | undefined>, RegExp]> = [
    ['short JWT secret', { JWT_SECRET: 'short-secret' }, /JWT_SECRET/],
    ['insecure cookies', { AUTH_COOKIE_SECURE: 'false' }, /AUTH_COOKIE_SECURE/],
    ['missing CORS allow-list', { CORS_ORIGINS: undefined }, /CORS_ORIGINS/],
    ['wildcard CORS', { CORS_ORIGINS: '*' }, /CORS_ORIGINS/],
    ['http CORS origin', { CORS_ORIGINS: 'http://app.crm.example.com' }, /CORS_ORIGINS/],
    ['http frontend', { FRONTEND_URL: 'http://app.crm.example.com' }, /FRONTEND_URL/],
    ['no Redis', { REDIS_URL: undefined }, /REDIS_URL/],
    ['memory storage', { STORAGE_PROVIDER: 'memory' }, /STORAGE_PROVIDER/],
    [
      'private webhook targets',
      { WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true' },
      /WEBHOOK_ALLOW_PRIVATE_TARGETS/,
    ],
    [
      'TLS disabled for a remote database',
      { DATABASE_URL: 'postgresql://u:p@db.example.com:5432/crm' },
      /DATABASE_SSL/,
    ],
    [
      'http Plivo webhook',
      { PLIVO_WEBHOOK_URL: 'http://api.crm.example.com/api/plivo/webhook' },
      /PLIVO_WEBHOOK_URL/,
    ],
    [
      'Plivo URL with a query',
      { PLIVO_WEBHOOK_URL: 'https://api.crm.example.com/api/plivo/webhook?x=1' },
      /PLIVO_WEBHOOK_URL/,
    ],
    ['weak metrics token', { METRICS_TOKEN: 'short' }, /METRICS_TOKEN/],
    ['malformed webhook key', { WEBHOOK_SECRET_KEY: 'not-32-bytes' }, /WEBHOOK_SECRET_KEY/],
    [
      'placeholder Plivo token with calling enabled',
      { PLIVO_AUTH_TOKEN: 'changeme', PLIVO_PHONE_NUMBER: '+10000000000' },
      /PLIVO_AUTH_TOKEN/,
    ],
    ['missing JWT secret', { JWT_SECRET: undefined }, /JWT_SECRET/],
  ];
  it.each(unsafe)('refuses to start with %s', (_name, override, pattern) => {
    const source = { ...productionEnv(), ...override };
    for (const [k, v] of Object.entries(override)) if (v === undefined) delete source[k];
    let message = '';
    try {
      loadApiEnv(source);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(pattern);
    // Values are never echoed (secrets must not reach logs).
    for (const value of Object.values(override)) {
      if (value && value.length > 6) expect(message).not.toContain(value);
    }
  });
});

describe('production-mode HTTP behaviour', () => {
  let server: Server;
  let base: string;
  const saved = { ...process.env };
  let close: () => Promise<void> = async () => {};
  let cookies: typeof import('../src/platform/auth/cookies.js');

  beforeAll(async () => {
    vi.resetModules();
    for (const key of Object.keys(process.env)) {
      if (!['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'].includes(key)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, productionEnv());
    const { default: app } = await import('../src/app.js');
    const { pool } = await import('../src/platform/db.js');
    const { rateLimitStore } = await import('../src/platform/rate-limit.js');
    cookies = await import('../src/platform/auth/cookies.js');
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = async () => {
      await new Promise((resolve) => server.close(resolve));
      await rateLimitStore().close();
      await pool.end();
    };
  });

  afterAll(async () => {
    await close();
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
    vi.resetModules();
  });

  it('sends strict security headers, no-store and the build version', async () => {
    const res = await fetch(`${base}/api/v1/health/live`);
    expect(res.status).toBe(200);
    expect(res.headers.get('strict-transport-security')).toMatch(/max-age=\d+/);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-crm-version')).toBe('1.0.0+abcdef012345');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('allows credentialed CORS only for the allow-listed origin', async () => {
    const allowed = await fetch(`${base}/api/v1/health/live`, {
      headers: { Origin: 'https://app.crm.example.com' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.crm.example.com');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');

    for (const origin of ['https://evil.example.com', 'http://app.crm.example.com', 'null']) {
      const denied = await fetch(`${base}/api/v1/health/live`, { headers: { Origin: origin } });
      expect(denied.headers.get('access-control-allow-origin')).toBeNull();
      const preflight = await fetch(`${base}/api/v1/leads`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
      });
      expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
      expect(preflight.headers.get('access-control-allow-credentials')).toBeNull();
    }
  });

  it('issues Secure, HttpOnly, path-scoped auth cookies', () => {
    const set: Array<{ name: string; options: Record<string, unknown> }> = [];
    const res = {
      cookie: (name: string, _value: string, options: Record<string, unknown>) =>
        set.push({ name, options }),
      setHeader: vi.fn(),
    };
    cookies.setAuthCookies(res as never, {
      accessToken: 'a',
      accessTokenExpiresAt: new Date(Date.now() + 60_000),
      refreshToken: 'r',
      sessionExpiresAt: new Date(Date.now() + 3_600_000),
    });
    expect(set).toEqual([
      {
        name: 'crm_at',
        options: expect.objectContaining({
          secure: true,
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        }),
      },
      {
        name: 'crm_rt',
        options: expect.objectContaining({
          secure: true,
          httpOnly: true,
          sameSite: 'lax',
          path: '/api/v1/auth',
        }),
      },
    ]);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('protects /metrics with a bearer token and exposes no tenant labels', async () => {
    expect((await fetch(`${base}/metrics`)).status).toBe(401);
    expect(
      (await fetch(`${base}/metrics`, { headers: { Authorization: 'Bearer wrong-token-value' } }))
        .status,
    ).toBe(401);
    const res = await fetch(`${base}/metrics`, {
      headers: { Authorization: `Bearer ${METRICS_TOKEN}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(text).toContain('crm_http_requests_total');
    expect(text).toContain('crm_build_info');
    expect(text).not.toMatch(/organization|user_?id|org_?id/i);
  });
});
