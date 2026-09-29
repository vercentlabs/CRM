import { describe, expect, it } from 'vitest';
import { databaseSsl, loadWorkerEnv } from './env.js';

const production = (): Record<string, string> => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://crm:pw@db.internal.example.com:5432/crm',
  REDIS_URL: 'rediss://default:pw@redis.example.com:6380',
  FRONTEND_URL: 'https://app.crm.example.com',
  EMAIL_PROVIDER: 'smtp',
  SMS_PROVIDER: 'none',
  STORAGE_PROVIDER: 'imagekit',
  IMAGEKIT_PUBLIC_KEY: 'public_x',
  IMAGEKIT_PRIVATE_KEY: 'private_x',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/x',
  WEBHOOK_SECRET_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  METRICS_TOKEN: 'worker-metrics-token-0123456789',
});

describe('worker production configuration', () => {
  it('accepts a safe configuration and defaults to verified database TLS', () => {
    const env = loadWorkerEnv(production());
    expect(databaseSsl(env)).toEqual({ rejectUnauthorized: true });
    expect(env.REDIS_URL?.startsWith('rediss://')).toBe(true);
  });

  it.each([
    ['REDIS_URL', { REDIS_URL: undefined }],
    ['EMAIL_PROVIDER', { EMAIL_PROVIDER: 'memory' }],
    ['SMS_PROVIDER', { SMS_PROVIDER: 'log' }],
    ['STORAGE_PROVIDER', { STORAGE_PROVIDER: 'memory' }],
    ['METRICS_TOKEN', { METRICS_TOKEN: 'short' }],
    ['DATABASE_SSL', { DATABASE_SSL: 'disable' }],
    ['WEBHOOK_SECRET_KEY', { WEBHOOK_SECRET_KEY: undefined }],
    ['FRONTEND_URL', { FRONTEND_URL: 'http://app.crm.example.com' }],
    ['WEBHOOK_ALLOW_PRIVATE_TARGETS', { WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true' }],
    ['PLIVO_AUTH_TOKEN', { SMS_PROVIDER: 'plivo', PLIVO_AUTH_ID: 'x', PLIVO_PHONE_NUMBER: '+1' }],
  ] as Array<[string, Record<string, string | undefined>]>)(
    'refuses unsafe %s',
    (key, override) => {
      const source: Record<string, string | undefined> = { ...production(), ...override };
      expect(() => loadWorkerEnv(source)).toThrow(new RegExp(key));
    },
  );

  it('allows plain connections to a private-network database service', () => {
    const env = loadWorkerEnv({
      ...production(),
      DATABASE_URL: 'postgresql://crm:pw@postgres:5432/crm',
      DATABASE_SSL: 'disable',
    });
    expect(databaseSsl(env)).toBe(false);
  });
});
