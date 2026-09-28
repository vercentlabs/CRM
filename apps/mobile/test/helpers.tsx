import type { AuthSessionView } from '@crm/types';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ComponentType, ReactElement } from 'react';
import { createMobileApiClient, setApiClient } from '../src/lib/api';
import { AppProviders } from '../src/providers/AppProviders';

export const ORG_A = {
  id: '00000000-0000-4000-8000-00000000000a',
  name: 'Acme Gold',
  slug: 'acme',
};
export const ORG_B = {
  id: '00000000-0000-4000-8000-00000000000b',
  name: 'Beta Traders',
  slug: 'beta',
};

/** Everything a sales member gets with organization scope. */
export const ALL_PERMISSIONS: AuthSessionView['permissions'] = Object.fromEntries(
  [
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
    'crm.tasks.read',
    'crm.tasks.create',
    'crm.tasks.update',
    'crm.tasks.delete',
    'crm.followups.read',
    'crm.followups.create',
    'crm.followups.update',
    'crm.notes.read',
    'crm.notes.create',
    'crm.notes.update',
    'crm.notes.delete',
    'crm.calls.read',
    'crm.calls.create',
    'crm.messages.read',
    'crm.messages.send',
    'crm.chat.use',
    'crm.reports.read',
    'crm.locations.read',
    'crm.locations.checkin',
    'crm.locations.manage',
    'settings.users.read',
    'settings.users.manage',
    'settings.organization.manage',
    'settings.audit.read',
  ].map((p) => [p, 'organization' as const]),
);

export function makeSession(overrides: Partial<AuthSessionView> = {}): AuthSessionView {
  return {
    user: { id: 7, email: 'asha@example.com', name: 'Asha Rao' },
    organization: ORG_A,
    membership: { id: 70, role: { key: 'admin', name: 'Admin' } },
    permissions: ALL_PERMISSIONS,
    organizations: [
      { organization: ORG_A, role: { key: 'admin', name: 'Admin' }, status: 'active' },
      { organization: ORG_B, role: { key: 'sales', name: 'Sales' }, status: 'active' },
    ],
    accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    sessionExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    ...overrides,
  } as AuthSessionView;
}

/** A tokens-bearing session as the API returns it to mobile clients. */
export const withTokens = (session: AuthSessionView, n = 1): AuthSessionView => ({
  ...session,
  accessToken: `access-${n}`,
  refreshToken: `refresh-${n}`,
});

export interface RecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
}

type Reply =
  | {
      status?: number;
      data?: unknown;
      meta?: unknown;
      error?: { code: string; message: string; details?: unknown[] };
    }
  | 'network-error';
type Handler = (call: RecordedCall) => Reply | Promise<Reply>;

/**
 * An in-memory `/api/v1` server: routes are "METHOD /path" (path without the
 * /api/v1 prefix; `:id` segments match anything). Every request is recorded.
 */
export function fakeServer(routes: Record<string, Handler | Reply>) {
  const calls: RecordedCall[] = [];
  const compiled = Object.entries(routes).map(([route, handler]) => {
    const [method, pattern] = route.split(' ') as [string, string];
    const regex = new RegExp(`^${pattern.replace(/:[a-z_]+/gi, '[^/]+')}$`);
    return { method, regex, handler };
  });
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const path = url.pathname.replace(/^\/api\/v1/, '') || '/';
    const headers = (init.headers ?? {}) as Record<string, string>;
    const call: RecordedCall = {
      method: init.method ?? 'GET',
      path,
      query: url.searchParams,
      headers,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    };
    calls.push(call);
    const route = compiled.find((r) => r.method === call.method && r.regex.test(path));
    const reply: Reply = route
      ? typeof route.handler === 'function'
        ? await route.handler(call)
        : route.handler
      : {
          status: 404,
          error: { code: 'NOT_FOUND', message: `No fake route for ${call.method} ${path}` },
        };
    if (reply === 'network-error') throw new TypeError('Network request failed');
    const status = reply.status ?? 200;
    const payload =
      status >= 400
        ? { success: false, error: reply.error ?? { code: 'ERROR', message: 'Request failed' } }
        : { success: true, data: reply.data ?? null, ...(reply.meta ? { meta: reply.meta } : {}) };
    const text = JSON.stringify(payload);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      text: async () => text,
    } as unknown as Response;
  }) as unknown as typeof fetch;

  const client = createMobileApiClient({ fetch: fetchImpl, baseUrl: 'http://api.test' });
  setApiClient(client);
  return {
    calls,
    client,
    find: (method: string, path: string | RegExp) =>
      calls.filter(
        (c) =>
          c.method === method && (typeof path === 'string' ? c.path === path : path.test(c.path)),
      ),
  };
}

export const page = <T,>(items: T[], pageNumber = 1, total = items.length, limit = 20) => ({
  data: items,
  meta: {
    pagination: {
      page: pageNumber,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  },
});

export const testQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });

/** Providers + a single-screen stack so hooks like useNavigation work. */
export function renderScreen(
  Component: ComponentType<never>,
  {
    session = makeSession(),
    params,
    queryClient = testQueryClient(),
  }: { session?: AuthSessionView | null; params?: object; queryClient?: QueryClient } = {},
) {
  const Stack = createNativeStackNavigator();
  const ui: ReactElement = (
    <AppProviders queryClient={queryClient} initialSession={session}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Under test" component={Component as never} initialParams={params} />
          {/* Targets for navigate() calls in the screen under test. */}
          {[
            'LeadDetail',
            'LeadForm',
            'CustomerForm',
            'OpportunityForm',
            'TaskForm',
            'NoteForm',
            'ChatThread',
            'BulkMessage',
            'Audit',
            'AddMember',
          ].map((name) => (
            <Stack.Screen key={name} name={name} component={Placeholder} />
          ))}
        </Stack.Navigator>
      </NavigationContainer>
    </AppProviders>
  );
  return { ...render(ui), queryClient };
}

function Placeholder() {
  return null;
}
