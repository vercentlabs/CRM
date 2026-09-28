import type { AuthSessionView } from '@crm/types';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { createWebApiClient, setApiClient } from '@/lib/api';
import { createQueryClient } from '@/lib/query';
import { AppProviders } from '@/providers/AppProviders';

export interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

type Reply = { status?: number; body?: unknown; text?: string; contentType?: string };
type Handler = (request: RecordedRequest) => Reply | Promise<Reply>;

/**
 * Scripted API: `on('GET /api/v1/leads', handler)`. Unmatched requests fail
 * the test loudly (404 with the path), so screens cannot silently call
 * something unexpected, such as a legacy endpoint.
 */
export function mockApi() {
  const routes: Array<{ method: string; pattern: RegExp; handler: Handler }> = [];
  const requests: RecordedRequest[] = [];

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : (init?.body ?? undefined);
    const request: RecordedRequest = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      query: url.searchParams,
      body,
      headers,
    };
    requests.push(request);
    const route = routes.find((r) => r.method === request.method && r.pattern.test(request.path));
    const reply: Reply = route
      ? await route.handler(request)
      : {
          status: 404,
          body: {
            success: false,
            error: { code: 'NOT_FOUND', message: `Unmocked ${request.method} ${request.path}` },
          },
        };
    const status = reply.status ?? 200;
    if (reply.text !== undefined) {
      return new Response(reply.text, {
        status,
        headers: { 'content-type': reply.contentType ?? 'text/plain' },
      });
    }
    return new Response(JSON.stringify(reply.body ?? {}), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });

  return {
    fetch: fetchImpl,
    requests,
    on(spec: string, handler: Handler | Reply) {
      const [method, path] = spec.split(' ') as [string, string];
      const pattern = new RegExp(`^${path.replace(/:\w+/g, '[^/]+')}$`);
      routes.unshift({
        method,
        pattern,
        handler: typeof handler === 'function' ? handler : () => handler,
      });
      return this;
    },
    find(method: string, path: string | RegExp) {
      return requests.filter(
        (r) =>
          r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)),
      );
    },
  };
}

export type MockApi = ReturnType<typeof mockApi>;

export const ok = (data: unknown, meta?: unknown) => ({
  body: { success: true, data, ...(meta ? { meta } : {}) },
});
export const page = <T,>(items: T[], pageNumber = 1, limit = 20, total = items.length) =>
  ok(items, {
    pagination: {
      page: pageNumber,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
export const apiError = (
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) => ({
  status,
  body: { success: false, error: { code, message, requestId: 'req-test-1', ...extra } },
});

type Scope = 'own' | 'organization';

export function makeSession(
  permissions: Record<string, Scope>,
  overrides: Partial<AuthSessionView> = {},
): AuthSessionView {
  return {
    user: { id: 10, email: 'ana@example.test', name: 'Ana Admin' },
    organization: { id: '11111111-1111-4111-8111-111111111111', name: 'Alpha Corp', slug: 'alpha' },
    membership: { id: 1, role: { key: 'admin', name: 'Admin' } },
    permissions,
    organizations: [
      {
        organization: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Alpha Corp',
          slug: 'alpha',
        },
        role: { key: 'admin', name: 'Admin' },
        status: 'active',
      },
    ],
    accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    sessionExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    csrfToken: 'csrf-test',
    ...overrides,
  };
}

const ALL = [
  'crm.leads.read',
  'crm.leads.create',
  'crm.leads.update',
  'crm.leads.assign',
  'crm.customers.read',
  'crm.customers.create',
  'crm.customers.update',
  'crm.customers.delete',
  'crm.opportunities.read',
  'crm.opportunities.create',
  'crm.opportunities.update',
  'crm.opportunities.assign',
  'crm.followups.read',
  'crm.followups.create',
  'crm.followups.update',
  'crm.tasks.read',
  'crm.tasks.create',
  'crm.tasks.update',
  'crm.tasks.delete',
  'crm.notes.read',
  'crm.notes.create',
  'crm.notes.update',
  'crm.notes.delete',
  'crm.calls.read',
  'crm.calls.create',
  'crm.calls.update',
  'crm.messages.read',
  'crm.messages.send',
  'crm.messages.update',
  'crm.chat.use',
  'crm.reports.read',
  'crm.reports.export',
  'crm.locations.read',
  'crm.locations.manage',
  'crm.locations.checkin',
  'settings.users.read',
  'settings.users.manage',
  'settings.organization.manage',
  'settings.audit.read',
];

export const ADMIN = Object.fromEntries(ALL.map((p) => [p, 'organization' as const]));

export const SALES: Record<string, Scope> = {
  'crm.leads.read': 'own',
  'crm.leads.create': 'own',
  'crm.leads.update': 'own',
  'crm.customers.read': 'own',
  'crm.customers.create': 'own',
  'crm.customers.update': 'own',
  'crm.opportunities.read': 'own',
  'crm.opportunities.create': 'own',
  'crm.opportunities.update': 'own',
  'crm.followups.read': 'own',
  'crm.followups.create': 'own',
  'crm.tasks.read': 'own',
  'crm.tasks.create': 'own',
  'crm.tasks.update': 'own',
  'crm.notes.read': 'own',
  'crm.chat.use': 'organization',
  'crm.reports.read': 'own',
};

/**
 * Renders with the real providers. `session: undefined` makes the provider
 * restore the session from the (mocked) API like the app does on load.
 */
export function renderApp(
  ui: ReactElement,
  { api, session }: { api: MockApi; session?: AuthSessionView | null },
) {
  setApiClient(
    createWebApiClient({ fetch: api.fetch as unknown as typeof fetch, baseUrl: 'http://api.test' }),
  );
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });
  const result = render(
    <AppProviders
      queryClient={queryClient}
      {...(session !== undefined ? { initialSession: session } : {})}
    >
      {ui}
    </AppProviders>,
  );
  return { ...result, queryClient };
}
