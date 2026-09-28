import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { PASSWORD } from './fixtures.js';

export interface TestServer {
  baseUrl: string;
  close(): Promise<void>;
}

/** Imports the app AFTER the caller has set DATABASE_URL, then listens on an ephemeral port. */
export async function startApp(): Promise<TestServer & { app: Express }> {
  const { default: app } = await import('../../src/app.js');
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      const { pool } = await import('../../src/platform/db.js');
      await pool.end();
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted structurally
export type Json = any;

export interface ApiResult {
  status: number;
  body: Json;
  headers: Headers;
}

export async function call(
  baseUrl: string,
  method: string,
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: Json = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // non-JSON (CSV)
  }
  return { status: response.status, body, headers: response.headers };
}

export interface MobileSession {
  accessToken: string;
  refreshToken: string;
  body: Json;
}

/** Logs in with body-delivered tokens (the mobile/API flow). */
export async function loginMobile(
  baseUrl: string,
  email: string,
  extra: Record<string, unknown> = {},
): Promise<MobileSession> {
  const result = await call(baseUrl, 'POST', '/api/v1/auth/login', {
    body: { email, password: PASSWORD, client: 'mobile', ...extra },
  });
  if (result.status !== 200) {
    throw new Error(`login failed for ${email}: ${result.status} ${JSON.stringify(result.body)}`);
  }
  return {
    accessToken: result.body.data.accessToken,
    refreshToken: result.body.data.refreshToken,
    body: result.body,
  };
}

/** Cookie jar helpers for the browser flow. */
export function cookiesFrom(
  headers: Headers,
): Record<string, { value: string; attributes: string }> {
  const jar: Record<string, { value: string; attributes: string }> = {};
  for (const line of headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(';');
    const index = pair!.indexOf('=');
    jar[pair!.slice(0, index).trim()] = {
      value: pair!.slice(index + 1),
      attributes: attrs.join(';'),
    };
  }
  return jar;
}
