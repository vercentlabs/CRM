import { act, screen, waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { AuthGate } from '@/components/auth/AuthGate';
import { useQueryKey, useSession } from '@/providers/SessionProvider';
import { ADMIN, apiError, makeSession, mockApi, ok, renderApp } from './harness';
import { navigation } from './setup';

function Probe() {
  const session = useSession();
  return (
    <div>
      <p data-testid="status">{session.status}</p>
      <p data-testid="org">{session.organization?.name ?? 'none'}</p>
      <button onClick={() => void session.logout()}>logout</button>
      <button
        onClick={() => void session.switchOrganization('22222222-2222-4222-8222-222222222222')}
      >
        switch
      </button>
    </div>
  );
}

describe('session', () => {
  it('restores the session from the cookie-backed API on load', async () => {
    const api = mockApi().on('GET /api/v1/auth/session', ok(makeSession(ADMIN)));
    renderApp(<Probe />, { api });
    expect(screen.getByTestId('status').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('org').textContent).toBe('Alpha Corp');
    // Cookie mode: credentials included, no bearer token anywhere.
    expect(api.requests[0]!.headers.Authorization).toBeUndefined();
  });

  it('refreshes once when the access cookie expired, then restores', async () => {
    let refreshed = false;
    const api = mockApi()
      .on('GET /api/v1/auth/session', () =>
        refreshed ? ok(makeSession(ADMIN)) : apiError(401, 'UNAUTHENTICATED', 'Expired'),
      )
      .on('POST /api/v1/auth/refresh', () => {
        refreshed = true;
        return ok(makeSession(ADMIN));
      });
    renderApp(<Probe />, { api });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(api.find('POST', '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('redirects unauthenticated visitors to login without rendering protected content', async () => {
    const api = mockApi()
      .on('GET /api/v1/auth/session', apiError(401, 'UNAUTHENTICATED', 'Not signed in'))
      .on('POST /api/v1/auth/refresh', apiError(401, 'UNAUTHENTICATED', 'No refresh token'));
    navigation.pathname = '/leads';
    navigation.search = new URLSearchParams('status=New');
    renderApp(
      <AuthGate>
        <p>secret leads</p>
      </AuthGate>,
      { api },
    );
    expect(screen.queryByText('secret leads')).toBeNull();
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        `/login?next=${encodeURIComponent('/leads?status=New')}`,
      ),
    );
    expect(screen.queryByText('secret leads')).toBeNull();
  });

  it('explains suspended memberships instead of looping to login', async () => {
    const api = mockApi().on(
      'GET /api/v1/auth/session',
      apiError(403, 'FORBIDDEN', 'Membership suspended'),
    );
    renderApp(
      <AuthGate>
        <p>secret</p>
      </AuthGate>,
      { api },
    );
    expect(await screen.findByText(/access to this organization is not active/i)).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('logs out through the API, clears cached data and the session', async () => {
    const api = mockApi()
      .on('POST /api/v1/chat/presence', ok({}))
      .on('PUT /api/v1/chat/presence', ok({}))
      .on('POST /api/v1/auth/logout', ok({ loggedOut: true }));
    const { queryClient } = renderApp(<Probe />, { api, session: makeSession(ADMIN) });
    queryClient.setQueryData(['org', 'x', 'leads'], ['cached']);
    await act(async () => screen.getByText('logout').click());
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
    const logout = api.find('POST', '/api/v1/auth/logout')[0]!;
    expect(logout.headers['x-csrf-token']).toBe('csrf-test');
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

function TenantData() {
  const key = useQueryKey();
  const { organization } = useSession();
  const leads = useQuery({
    queryKey: key('leads'),
    queryFn: async () => `leads of ${organization?.name}`,
  });
  return <p data-testid="data">{leads.data ?? 'loading'}</p>;
}

describe('organization switching', () => {
  it('drops every cached query of the previous organization and scopes keys by organization', async () => {
    const beta = makeSession(ADMIN, {
      organization: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Beta Ltd',
        slug: 'beta',
        timezone: 'Asia/Kolkata',
      },
      csrfToken: 'csrf-beta',
    });
    const api = mockApi().on('POST /api/v1/auth/switch-organization', ok(beta));
    const { queryClient } = renderApp(
      <>
        <Probe />
        <TenantData />
      </>,
      { api, session: makeSession(ADMIN) },
    );
    await waitFor(() => expect(screen.getByTestId('data').textContent).toBe('leads of Alpha Corp'));
    const alphaKeys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey));
    expect(alphaKeys.every((k) => k.includes('11111111-1111-4111-8111-111111111111'))).toBe(true);

    await act(async () => screen.getByText('switch').click());
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('Beta Ltd'));
    await waitFor(() => expect(screen.getByTestId('data').textContent).toBe('leads of Beta Ltd'));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey));
    expect(keys.some((k) => k.includes('11111111-1111-4111-8111-111111111111'))).toBe(false);
    expect(api.find('POST', '/api/v1/auth/switch-organization')[0]!.body).toEqual({
      organizationId: '22222222-2222-4222-8222-222222222222',
    });
  });
});
