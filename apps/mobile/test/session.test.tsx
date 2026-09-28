import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { api } from '../src/lib/api';
import { tokens } from '../src/lib/tokens';
import { AppProviders } from '../src/providers/AppProviders';
import { useSession, type SessionContextValue } from '../src/providers/SessionProvider';
import { fakeServer, makeSession, testQueryClient, withTokens } from './helpers';
import { mockAsyncStore, mockSecureStore } from './setup';

let current: SessionContextValue;
function Probe() {
  current = useSession();
  return <Text testID="status">{current.status}</Text>;
}

const mount = (initialSession?: Parameters<typeof AppProviders>[0]['initialSession']) =>
  render(
    <AppProviders
      queryClient={testQueryClient()}
      {...(initialSession !== undefined ? { initialSession } : {})}
    >
      <Probe />
    </AppProviders>,
  );

const status = () => screen.getByTestId('status').props.children as string;
const refreshKey = () => [...mockSecureStore.keys()].find((k) => k.startsWith('crm_refresh.'));

beforeEach(async () => {
  await tokens.clear();
});

describe('session restore', () => {
  test('without a stored refresh token the app is signed out (no request made)', async () => {
    const server = fakeServer({});
    mount();
    expect(status()).toBe('starting');
    await waitFor(() => expect(status()).toBe('signed-out'));
    expect(server.calls).toHaveLength(0);
  });

  test('a stored refresh token is exchanged and the rotated token persisted', async () => {
    await tokens.store({ refreshToken: 'refresh-old' });
    const server = fakeServer({ 'POST /auth/refresh': { data: withTokens(makeSession(), 2) } });
    mount();
    await waitFor(() => expect(status()).toBe('signed-in'));
    expect(server.find('POST', '/auth/refresh')[0]!.body).toEqual({ refreshToken: 'refresh-old' });
    expect(server.find('POST', '/auth/refresh')[0]!.headers.Authorization).toBeUndefined();
    expect(mockSecureStore.get(refreshKey()!)).toBe('refresh-2');
    expect(tokens.getAccessToken()).toBe('access-2');
    expect(current.organization?.slug).toBe('acme');
  });

  test('a revoked refresh token signs out and clears SecureStore', async () => {
    await tokens.store({ refreshToken: 'refresh-revoked' });
    fakeServer({
      'POST /auth/refresh': {
        status: 401,
        error: { code: 'UNAUTHENTICATED', message: 'Session expired' },
      },
    });
    mount();
    await waitFor(() => expect(status()).toBe('signed-out'));
    expect(refreshKey()).toBeUndefined();
  });

  test('a suspended membership lands on no-access', async () => {
    await tokens.store({ refreshToken: 'refresh-1' });
    fakeServer({
      'POST /auth/refresh': {
        status: 403,
        error: { code: 'FORBIDDEN', message: 'Membership is not active' },
      },
    });
    mount();
    await waitFor(() => expect(status()).toBe('no-access'));
  });

  test('offline restore shows an error and keeps the refresh token for retry', async () => {
    await tokens.store({ refreshToken: 'refresh-1' });
    fakeServer({ 'POST /auth/refresh': 'network-error' });
    mount();
    await waitFor(() => expect(status()).toBe('error'));
    expect(mockSecureStore.get(refreshKey()!)).toBe('refresh-1');

    fakeServer({ 'POST /auth/refresh': { data: withTokens(makeSession(), 3) } });
    act(() => current.retry());
    await waitFor(() => expect(status()).toBe('signed-in'));
  });
});

describe('login and tokens', () => {
  test('login keeps the access token in memory and only the refresh token in SecureStore', async () => {
    const server = fakeServer({ 'POST /auth/login': { data: withTokens(makeSession()) } });
    mount(null);
    await act(() => current.login({ email: 'asha@example.com', password: 'secret123' }));
    expect(status()).toBe('signed-in');
    expect(server.find('POST', '/auth/login')[0]!.body).toMatchObject({
      email: 'asha@example.com',
      client: 'mobile',
    });

    expect(tokens.getAccessToken()).toBe('access-1');
    expect([...mockSecureStore.values()]).toEqual(['refresh-1']);
    // Nothing token-like is written to AsyncStorage (only the theme preference may be).
    for (const value of mockAsyncStore.values()) expect(value).not.toMatch(/access-|refresh-/);
    // Screens never see tokens.
    expect(JSON.stringify(current)).not.toMatch(/access-1|refresh-1/);
  });

  test('a failed login surfaces the error and stays signed out', async () => {
    fakeServer({
      'POST /auth/login': {
        status: 401,
        error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password' },
      },
    });
    mount(null);
    await expect(
      act(() => current.login({ email: 'a@b.co', password: 'wrongpass1' })),
    ).rejects.toMatchObject({ status: 401 });
    expect(status()).toBe('signed-out');
    expect(mockSecureStore.size).toBe(0);
  });

  test('concurrent 401s share one refresh, then both requests are retried with the new token', async () => {
    await tokens.store({ accessToken: 'access-stale', refreshToken: 'refresh-1' });
    let refreshes = 0;
    const server = fakeServer({
      'POST /auth/refresh': async () => {
        refreshes += 1;
        await new Promise((r) => setTimeout(r, 10));
        return { data: withTokens(makeSession(), 2) };
      },
      'GET /leads/:id': (call) =>
        call.headers.Authorization === 'Bearer access-2'
          ? { data: { id: 1 } }
          : { status: 401, error: { code: 'UNAUTHENTICATED', message: 'expired' } },
    });
    mount(makeSession());
    const results = await act(() => Promise.all([api().v1.leads.get(1), api().v1.leads.get(2)]));
    expect(results).toHaveLength(2);
    expect(refreshes).toBe(1);
    expect(mockSecureStore.get(refreshKey()!)).toBe('refresh-2');
    expect(
      server.find('GET', /^\/leads\//).filter((c) => c.headers.Authorization === 'Bearer access-2'),
    ).toHaveLength(2);
  });

  test('a request whose refresh is rejected ends the session as expired', async () => {
    await tokens.store({ accessToken: 'access-stale', refreshToken: 'refresh-reused' });
    fakeServer({
      'POST /auth/refresh': { status: 401, error: { code: 'UNAUTHENTICATED', message: 'reused' } },
      'GET /leads/:id': { status: 401, error: { code: 'UNAUTHENTICATED', message: 'expired' } },
    });
    mount(makeSession());
    await act(async () => {
      await expect(api().v1.leads.get(1)).rejects.toMatchObject({ status: 401 });
    });
    await waitFor(() => expect(status()).toBe('signed-out'));
    expect(current.expired).toBe(true);
    expect(refreshKey()).toBeUndefined();
    expect(tokens.getAccessToken()).toBeNull();
  });

  test('logout revokes the refresh token server-side and clears local state', async () => {
    await tokens.store({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const server = fakeServer({
      'PUT /chat/presence': { data: {} },
      'POST /auth/logout': { data: { loggedOut: true } },
    });
    mount(makeSession());
    await act(() => current.logout());
    expect(server.find('POST', '/auth/logout')[0]!.body).toEqual({ refreshToken: 'refresh-1' });
    expect(server.find('PUT', '/chat/presence')[0]!.body).toEqual({ is_online: false });
    expect(status()).toBe('signed-out');
    expect(mockSecureStore.size).toBe(0);
    expect(tokens.getAccessToken()).toBeNull();
  });

  test('logout still signs out locally when the server is unreachable', async () => {
    await tokens.store({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    fakeServer({ 'PUT /chat/presence': 'network-error', 'POST /auth/logout': 'network-error' });
    mount(makeSession());
    await act(() => current.logout());
    expect(status()).toBe('signed-out');
    expect(mockSecureStore.size).toBe(0);
  });
});
