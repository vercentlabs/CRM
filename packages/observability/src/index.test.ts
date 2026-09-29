import { describe, expect, it } from 'vitest';
import {
  buildInfo,
  captureError,
  createLogger,
  createRegistry,
  errorFields,
  logErrorReporter,
  metricsAuthorized,
  redact,
  setErrorReporter,
  statusClass,
} from './index.js';

const SECRETS = {
  password: 'Hunter2-password!',
  refreshToken: 'rt_9f8e7d6c5b4a3210',
  resetToken: 'a3f9c1d2e4b5a6c7d8e9f0a1b2c3d4e5',
  webhookSecret: 'whsec_abcdefghijklmnop',
  apiKey: 'AKIA-SECRET-KEY-123',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.c2lnbmF0dXJlLXZhbHVl',
};

function capture() {
  const lines: string[] = [];
  const logger = createLogger({
    service: 'test',
    level: 'debug',
    write: (_l, line) => lines.push(line),
  });
  return { lines, logger };
}

describe('log redaction', () => {
  it('never writes seeded secrets, whatever field or string they hide in', () => {
    const { lines, logger } = capture();
    logger.info('login_attempt', {
      email: 'a@b.test',
      password: SECRETS.password,
      body: { newPassword: SECRETS.password, refreshToken: SECRETS.refreshToken },
      headers: { authorization: `Bearer ${SECRETS.jwt}`, cookie: `crm_rt=${SECRETS.refreshToken}` },
      url: `https://crm.test/reset-password?token=${SECRETS.resetToken}`,
      note: `signing with ${SECRETS.webhookSecret} and key ${SECRETS.jwt}`,
      api_key: SECRETS.apiKey,
      secret_ciphertext: 'v1.abc.def',
      database: 'postgresql://crm:SuperSecretDbPass@db.internal:5432/crm',
      redis: 'rediss://default:RedisPassw0rd@cache:6380',
    });
    logger.error(
      'failed',
      errorFields(new Error(`bad token ${SECRETS.jwt} for Bearer ${SECRETS.refreshToken}`)),
    );
    const out = lines.join('\n');
    for (const value of [
      ...Object.values(SECRETS),
      'SuperSecretDbPass',
      'RedisPassw0rd',
      'v1.abc.def',
    ]) {
      expect(out, value).not.toContain(value);
    }
    const first = JSON.parse(lines[0]!);
    expect(first).toMatchObject({
      level: 'info',
      msg: 'login_attempt',
      service: 'test',
      email: 'a@b.test',
      password: '[REDACTED]',
    });
    expect(first.database).toBe('postgresql://crm:[REDACTED]@db.internal:5432/crm');
  });

  it('keeps safe codes and identifiers', () => {
    expect(redact({ failure_code: 'PROVIDER_REJECTED', organizationId: 3, jobId: 'x' })).toEqual({
      failure_code: 'PROVIDER_REJECTED',
      organizationId: 3,
      jobId: 'x',
    });
  });

  it('merges request context and filters by level', () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'api',
      level: 'warn',
      context: () => ({ requestId: 'req-1', organizationId: 7 }),
      write: (_l, line) => lines.push(line),
    });
    logger.info('hidden');
    logger.child({ route: '/leads' }).warn('shown', { durationMs: 5 });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      requestId: 'req-1',
      organizationId: 7,
      route: '/leads',
      durationMs: 5,
    });
  });
});

describe('error reporting', () => {
  it('reports through the configured adapter with redacted context', () => {
    const { lines, logger } = capture();
    setErrorReporter(logErrorReporter(logger));
    captureError(new Error('boom'), {
      requestId: 'r',
      route: '/x',
      authorization: `Bearer ${SECRETS.jwt}`,
    });
    expect(lines.join()).toContain('error_captured');
    expect(lines.join()).not.toContain(SECRETS.jwt);
  });
});

describe('metrics and build info', () => {
  it('exposes build info and default metrics', async () => {
    const registry = createRegistry('api', { version: '1.2.3', commit: 'abc1234' });
    const text = await registry.metrics();
    expect(text).toContain('crm_build_info{version="1.2.3",commit="abc1234",service="api"} 1');
    expect(text).toContain('crm_api_process_cpu');
  });

  it('protects the endpoint with a constant-time bearer token', () => {
    expect(metricsAuthorized('Bearer s3cret-token', 's3cret-token')).toBe(true);
    expect(metricsAuthorized('Bearer wrong', 's3cret-token')).toBe(false);
    expect(metricsAuthorized(undefined, 's3cret-token')).toBe(false);
    expect(metricsAuthorized('Bearer x', undefined)).toBe(false);
    expect(statusClass(503)).toBe('5xx');
  });

  it('derives build identity from injected env only', () => {
    expect(buildInfo({})).toEqual({ version: '0.0.0-dev', commit: 'dev', builtAt: null });
    expect(
      buildInfo({
        APP_VERSION: '1.0.0',
        GIT_SHA: '0123456789abcdef0123',
        BUILD_TIME: '2026-09-29T00:00:00Z',
      }),
    ).toEqual({
      version: '1.0.0',
      commit: '0123456789ab',
      builtAt: '2026-09-29T00:00:00Z',
    });
    expect(buildInfo({ GIT_SHA: '$(rm -rf)' }).commit).toBe('dev');
  });
});
