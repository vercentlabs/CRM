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
  it('exposes notifications, entitlements and file deletion under /api/v1', async () => {
    const pagination = { page: 1, limit: 20, total: 0, totalPages: 1 };
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, data: [], meta: { pagination } }),
    );
    const client = createApiClient({
      baseUrl: 'http://api.test',
      getToken: () => 't',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.v1.notifications.list({ unread: true });
    await client.v1.notifications.unreadCount();
    await client.v1.notifications.markRead('a b');
    await client.v1.notifications.markAllRead();
    await client.v1.organizations.entitlements();
    await client.v1.files.remove('f-1');
    const calls = (fetchMock.mock.calls as unknown as Call[]).map(
      ([url, init]) => `${init.method} ${url}`,
    );
    expect(calls).toEqual([
      'GET http://api.test/api/v1/notifications?unread=true',
      'GET http://api.test/api/v1/notifications/unread-count',
      'POST http://api.test/api/v1/notifications/a%20b/read',
      'POST http://api.test/api/v1/notifications/read-all',
      'GET http://api.test/api/v1/organization/entitlements',
      'DELETE http://api.test/api/v1/files/f-1',
    ]);
  });

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

describe('session refresh', () => {
  const unauthorized = () =>
    jsonResponse(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'Expired' } });

  it('refreshes once for concurrent 401s and retries each request', async () => {
    let authed = false;
    const fetchMock = vi.fn(async () =>
      authed ? jsonResponse(200, { success: true, data: { ok: true } }) : unauthorized(),
    );
    const refreshSession = vi.fn(async () => {
      authed = true;
      return true;
    });
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
      refreshSession,
    });

    await Promise.all([client.v1.auth.session(), client.v1.leads.get(1)]);

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('gives up when the refresh fails and never refreshes anonymous calls', async () => {
    const fetchMock = vi.fn(async () => unauthorized());
    const onUnauthorized = vi.fn();
    const refreshSession = vi.fn(async () => false);
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
      refreshSession,
      onUnauthorized,
    });

    await expect(client.v1.leads.get(1)).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await expect(client.v1.auth.login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({
      status: 401,
    });
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('downloads non-envelope bodies (CSV) as text', async () => {
    const fetchMock = vi.fn(
      async () => new Response('id,name\n1,A', { headers: { 'content-type': 'text/csv' } }),
    );
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(await client.v1.reports.leadsCsv()).toBe('id,name\n1,A');
  });
});
