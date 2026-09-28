import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, buildUrl, createApiClient } from './index.js';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('buildUrl', () => {
  it('joins base and path and skips empty query values', () => {
    expect(buildUrl('http://api.test/', 'leads', { page: 2, q: undefined, tag: ['a', 'b'] })).toBe(
      'http://api.test/leads?page=2&tag=a&tag=b',
    );
  });
});

describe('createApiClient', () => {
  it('sends auth, request id and JSON body', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true, data: { id: 1 } }));
    const client = createApiClient({
      baseUrl: async () => 'http://api.test',
      getToken: () => 'tok',
      fetch: fetchMock as unknown as typeof fetch,
      generateRequestId: () => 'req-1',
    });

    const result = await client.post('/leads', { name: 'A' });

    expect(result).toEqual({ success: true, data: { id: 1 } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/leads');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"A"}');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok',
      'Content-Type': 'application/json',
      'x-request-id': 'req-1',
    });
  });

  it('omits the token for anonymous requests and unwraps v1 envelopes', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        data: { status: 'ok', uptimeSeconds: 1, timestamp: 't' },
      }),
    );
    const client = createApiClient({
      baseUrl: 'http://api.test',
      getToken: () => 'tok',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(client.v1.health.live()).resolves.toEqual({
      status: 'ok',
      uptimeSeconds: 1,
      timestamp: 't',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/health/live');
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('maps v1 error envelopes', async () => {
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: (async () =>
        jsonResponse(404, {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Lead not found', requestId: 'r-9' },
        })) as unknown as typeof fetch,
    });

    const error = await client.get('/api/v1/leads/1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Lead not found',
      requestId: 'r-9',
    });
  });

  it('maps legacy error envelopes and notifies on 401', async () => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: 'http://api.test',
      onUnauthorized,
      fetch: (async () =>
        jsonResponse(401, { message: 'Invalid token.' })) as unknown as typeof fetch,
    });

    const error = await client.get('/leads').catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Invalid token.',
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('reports network failures and timeouts', async () => {
    const failing = createApiClient({
      baseUrl: 'http://api.test',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    });
    await expect(failing.get('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });

    const slow = createApiClient({
      baseUrl: 'http://api.test',
      timeoutMs: 5,
      fetch: ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })) as unknown as typeof fetch,
    });
    await expect(slow.get('/x')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
