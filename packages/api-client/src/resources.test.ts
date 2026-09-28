import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, createApiClient } from './index.js';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type Call = [string, RequestInit & { headers: Record<string, string> }];

describe('v1 resources', () => {
  it('uses cookies and CSRF in web mode (unsafe methods only)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true, data: { id: 7 } }));
    const client = createApiClient({
      baseUrl: 'http://api.test',
      credentials: 'include',
      getCsrfToken: () => 'csrf-1',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.v1.leads.get(7);
    await client.v1.leads.update(7, { status: 'Contacted' });

    const [getUrl, getInit] = fetchMock.mock.calls[0] as unknown as Call;
    const [patchUrl, patchInit] = fetchMock.mock.calls[1] as unknown as Call;
    expect(getUrl).toBe('http://api.test/api/v1/leads/7');
    expect(getInit.credentials).toBe('include');
    expect(getInit.headers['x-csrf-token']).toBeUndefined();
    expect(getInit.headers.Authorization).toBeUndefined();
    expect(patchUrl).toBe('http://api.test/api/v1/leads/7');
    expect(patchInit.method).toBe('PATCH');
    expect(patchInit.headers['x-csrf-token']).toBe('csrf-1');
  });

  it('uses bearer tokens in mobile mode and unwraps pagination', async () => {
    const pagination = { page: 2, limit: 10, total: 11, totalPages: 2 };
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, data: [{ id: 1 }], meta: { pagination } }),
    );
    const client = createApiClient({
      baseUrl: 'http://api.test',
      getToken: () => 'tok',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const page = await client.v1.customers.list({ page: 2, limit: 10 });

    expect(page).toEqual({ items: [{ id: 1 }], pagination });
    const [url, init] = fetchMock.mock.calls[0] as unknown as Call;
    expect(url).toBe('http://api.test/api/v1/customers?page=2&limit=10');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.credentials).toBeUndefined();
  });

  it('does not send a bearer token on anonymous auth calls', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, data: { requested: true } }),
    );
    const client = createApiClient({
      baseUrl: 'http://api.test',
      getToken: () => 'tok',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.v1.auth.forgotPassword('a@example.test');
    const [url, init] = fetchMock.mock.calls[0] as unknown as Call;
    expect(url).toBe('http://api.test/api/v1/auth/password/forgot');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('surfaces the standard error envelope with its request id', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(404, {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lead not found', requestId: 'req-9' },
      }),
    );
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const error = await client.v1.leads.get(1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Lead not found',
      requestId: 'req-9',
    });
  });
});
