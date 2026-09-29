import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { pool } from '../src/platform/db.js';
import { AppError } from '../src/platform/http/errors.js';
import { errorHandler } from '../src/platform/http/error-handler.js';
import { requestContextMiddleware } from '../src/platform/request-context.js';

async function listen(handler: express.Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = handler.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted structurally
const json = (res: Response): Promise<any> => res.json();

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  ({ server, baseUrl } = await listen(app));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

describe('health endpoints', () => {
  it('no longer serves the pre-v1 /health (use /api/v1/health/live)', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('serves /api/v1/health/live with the v1 envelope and a request id', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health/live`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get('x-powered-by')).toBeNull();
    const body = await json(res);
    expect(body).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it('reports readiness from the database without leaking details', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health/ready`);
    const body = await json(res);
    const expectReady = Boolean(process.env.TEST_DATABASE_URL);
    expect(res.status).toBe(expectReady ? 200 : 503);
    expect(body.data.checks.database.status).toBe(expectReady ? 'ok' : 'unavailable');
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('127.0.0.1');
    expect(raw).not.toMatch(/password|ECONNREFUSED|postgres/i);
  });
});

describe('request ids', () => {
  it('echoes a safe incoming x-request-id', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health/live`, {
      headers: { 'x-request-id': 'client-req-12345' },
    });
    expect(res.headers.get('x-request-id')).toBe('client-req-12345');
  });

  it('replaces unsafe incoming ids', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health/live`, {
      headers: { 'x-request-id': 'bad id with spaces <script>' },
    });
    expect(res.headers.get('x-request-id')).not.toContain('script');
  });
});

describe('error handling', () => {
  it('returns the v1 error envelope for unknown v1 routes', async () => {
    const res = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('returns a safe JSON 400 for malformed JSON', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email":',
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Malformed JSON request body' },
    });
    expect(JSON.stringify(body)).not.toMatch(/at .*\.js|stack/i);
  });

  it('hides internal error messages and stack traces', async () => {
    const errorSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const mini = express();
    mini.use(requestContextMiddleware);
    mini.get('/api/v1/boom', () => {
      throw new Error('relation "secret_table" does not exist');
    });
    mini.get('/api/v1/teapot', () => {
      throw AppError.conflict('Lead already converted');
    });
    mini.use(errorHandler);
    const { server: miniServer, baseUrl: miniUrl } = await listen(mini);
    try {
      const boom = await fetch(`${miniUrl}/api/v1/boom`);
      expect(boom.status).toBe(500);
      const boomBody = await json(boom);
      expect(boomBody.error).toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
      expect(JSON.stringify(boomBody)).not.toContain('secret_table');
      expect(errorSpy).toHaveBeenCalled();

      const conflict = await fetch(`${miniUrl}/api/v1/teapot`);
      expect(conflict.status).toBe(409);
      expect((await json(conflict)).error).toMatchObject({
        code: 'CONFLICT',
        message: 'Lead already converted',
      });
    } finally {
      await new Promise((resolve) => miniServer.close(resolve));
      errorSpy.mockRestore();
    }
  });

  it('logs bugs as reported errors but dependency outages as warnings without stacks', async () => {
    const lines: string[] = [];
    const capture = (chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    };
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    const mini = express();
    mini.use(requestContextMiddleware);
    mini.get('/api/v1/bug', () => {
      throw new TypeError('cannot read x of undefined');
    });
    mini.get('/api/v1/outage', () => {
      throw AppError.serviceUnavailable('Gold rate service unavailable');
    });
    mini.use(errorHandler);
    const { server: miniServer, baseUrl: miniUrl } = await listen(mini);
    try {
      expect((await fetch(`${miniUrl}/api/v1/bug`)).status).toBe(500);
      expect((await fetch(`${miniUrl}/api/v1/outage`)).status).toBe(503);
    } finally {
      await new Promise((resolve) => miniServer.close(resolve));
      err.mockRestore();
      out.mockRestore();
    }
    const records = lines
      .flatMap((l) => l.split('\n'))
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const failed = (status: number) =>
      records.find((r) => r.msg === 'request_failed' && r.status === status)!;
    expect(failed(500).level).toBe('error');
    expect(JSON.stringify(failed(500))).toContain('stack');
    expect(failed(503).level).toBe('warn');
    expect(JSON.stringify(failed(503))).not.toContain('stack');
    const captured = records.filter((r) => r.msg === 'error_captured');
    expect(captured).toHaveLength(1);
  });
});

describe('authentication guards', () => {
  it('rejects unauthenticated lead-message status updates', async () => {
    const res = await fetch(`${baseUrl}/api/v1/messages/1/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'Delivered' }),
    });
    expect(res.status).toBe(401);
  });

  it('requires a token on protected routes', async () => {
    const res = await fetch(`${baseUrl}/api/v1/leads`);
    expect(res.status).toBe(401);
  });
});

describe('removed pre-v1 routes', () => {
  // Phase 5 removed every unversioned client route. They must never be
  // remounted: each answers the standard JSON 404 without authentication or
  // side effects. Provider webhooks (/api/plivo/*) are the only non-v1 routes.
  const OLD_ROUTES: Array<[method: string, path: string]> = [
    ['POST', '/auth/login'],
    ['POST', '/auth/refresh-token'],
    ['GET', '/users'],
    ['GET', '/users/me'],
    ['POST', '/admin/users'],
    ['GET', '/leads'],
    ['POST', '/leads'],
    ['GET', '/followups/overdue'],
    ['POST', '/calls/initiate'],
    ['GET', '/messages'],
    ['POST', '/api/lead-messages/send'],
    ['GET', '/customers'],
    ['GET', '/gold/gold-rate'],
    ['GET', '/reports/dashboard-summary'],
    ['GET', '/audit'],
    ['GET', '/sales-locations'],
    ['GET', '/opportunities'],
    ['GET', '/tasks'],
    ['GET', '/notes'],
    ['GET', '/calendar'],
    ['GET', '/api/chat/conversations'],
    ['GET', '/settings'],
    ['POST', '/api/upload/chat-file'],
    ['GET', '/health'],
  ];

  it.each(OLD_ROUTES)('%s %s answers a JSON 404', async (method, path) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: 'Bearer anything' },
      ...(method === 'GET' ? {} : { body: '{}' }),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('deprecation')).toBeNull();
    const body = await json(res);
    expect(body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('keeps the Plivo webhook URLs mounted (signature-verified, not 404)', async () => {
    const res = await fetch(`${baseUrl}/api/plivo/webhook/status`, { method: 'POST' });
    expect(res.status).not.toBe(404);
  });
});
