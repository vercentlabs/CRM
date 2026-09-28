import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { redactAuditValues } from './audit.js';
import { errorHandler } from './http/error-handler.js';
import { createRateLimiter } from './rate-limit.js';
import { parseId } from './tenancy.js';

describe('audit redaction', () => {
  it('removes credentials and tokens at any depth', () => {
    const redacted = redactAuditValues({
      email: 'a@b.test',
      password_hash: '$2b$12$abc',
      nested: { refreshToken: 'r', apiKey: 'k', keep: 1 },
      list: [{ password: 'p' }],
    });
    expect(redacted).toEqual({
      email: 'a@b.test',
      password_hash: '[REDACTED]',
      nested: { refreshToken: '[REDACTED]', apiKey: '[REDACTED]', keep: 1 },
      list: [{ password: '[REDACTED]' }],
    });
  });
});

describe('parseId', () => {
  it('accepts positive integer ids only', () => {
    expect(parseId('12')).toBe(12);
    expect(parseId(7)).toBe(7);
    for (const value of ['0', '-1', '1.5', '1 OR 1=1', '', null, undefined, '99999999999']) {
      expect(parseId(value)).toBeNull();
    }
  });
});

describe('rate limiter', () => {
  it('blocks after the configured attempts per key and reports Retry-After', async () => {
    const limiter = createRateLimiter({
      name: 'test',
      max: 2,
      windowSeconds: 60,
      key: (req) => String(req.body?.email),
    });
    const app = express();
    app.use(express.json());
    app.post('/login', limiter, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const server = await new Promise<import('node:http').Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/login`;
    const post = (email: string) =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect((await post('a@x.test')).status).toBe(200);
      expect((await post('a@x.test')).status).toBe(200);
      const blocked = await post('a@x.test');
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('retry-after')).toBeTruthy();
      expect((await post('b@x.test')).status).toBe(200);
      limiter.reset();
      expect((await post('a@x.test')).status).toBe(200);
      warn.mockRestore();
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
