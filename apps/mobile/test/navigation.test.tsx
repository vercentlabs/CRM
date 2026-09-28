import type { AuthSessionView } from '@crm/types';
import { NavigationContainer } from '@react-navigation/native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { tokens } from '../src/lib/tokens';
import { MENU, visibleMenu } from '../src/navigation/menu';
import { RootNavigator } from '../src/navigation/RootNavigator';
import { AppProviders } from '../src/providers/AppProviders';
import {
  fakeServer,
  makeSession,
  ORG_A,
  ORG_B,
  page,
  testQueryClient,
  withTokens,
} from './helpers';

const salesPermissions: AuthSessionView['permissions'] = {
  'crm.leads.read': 'own',
  'crm.leads.create': 'own',
  'crm.leads.update': 'own',
  'crm.followups.read': 'own',
  'crm.followups.create': 'own',
  'crm.tasks.read': 'own',
  'crm.tasks.create': 'own',
  'crm.tasks.update': 'own',
  'crm.calls.read': 'own',
  'crm.calls.create': 'own',
};

const canAnyFor =
  (permissions: AuthSessionView['permissions']) =>
  (...list: string[]) =>
    list.some((p) => p in permissions);

describe('permission-driven navigation', () => {
  test('menu entries come from permissions, never from a numeric role', () => {
    const labels = visibleMenu(canAnyFor(salesPermissions)).flatMap((g) =>
      g.items.map((i) => i.route),
    );
    expect(labels).toEqual([
      'Home',
      'Notifications',
      'Tasks',
      'Calendar',
      'Followups',
      'Leads',
      'Calls',
      'Account',
    ]);
    // Admin-only groups disappear entirely.
    expect(visibleMenu(canAnyFor(salesPermissions)).map((g) => g.label)).not.toContain('Insights');
  });

  test('a full-access member sees every destination', () => {
    const all = MENU.flatMap((g) => g.items.map((i) => i.route));
    const visible = visibleMenu(() => true).flatMap((g) => g.items.map((i) => i.route));
    expect(visible).toEqual(all);
  });

  test('no destination is always hidden (no "coming soon" or placeholder entries)', () => {
    for (const item of MENU.flatMap((g) => g.items))
      expect(item.label).not.toMatch(/coming soon|placeholder|ai/i);
  });
});

function mountApp(session?: AuthSessionView | null) {
  return render(
    <AppProviders
      queryClient={testQueryClient()}
      {...(session !== undefined ? { initialSession: session } : {})}
    >
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AppProviders>,
  );
}

const homeRoutes = {
  'GET /reports/dashboard-summary': {
    data: {
      totalLeads: 3,
      leadsByStatus: [],
      pendingFollowups: 1,
      overdueFollowups: 0,
      callsToday: 0,
      messagesToday: 0,
    },
  },
  'GET /followups': { data: [] },
  'GET /tasks': page([]),
  'GET /leads': page([]),
  'GET /market/gold-rate': { status: 503, error: { code: 'UNAVAILABLE', message: 'down' } },
  'GET /chat/conversations': { data: [] },
};

describe('auth routing', () => {
  beforeEach(async () => {
    await tokens.clear();
  });

  test('starting → signed out shows the login screen without flashing CRM screens', async () => {
    fakeServer({});
    mountApp();
    expect(screen.getByText('Restoring your session…')).toBeTruthy();
    expect(await screen.findByTestId('login-submit')).toBeTruthy();
    expect(screen.queryByText(/Hello,/)).toBeNull();
  });

  test('signing in opens Home for the organization', async () => {
    fakeServer({ ...homeRoutes, 'POST /auth/login': { data: withTokens(makeSession()) } });
    mountApp(null);
    fireEvent.changeText(await screen.findByLabelText('Email'), 'asha@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await act(async () => fireEvent.press(screen.getByTestId('login-submit')));
    expect(await screen.findByText('Hello, Asha')).toBeTruthy();
    expect(screen.getByText(ORG_A.name)).toBeTruthy();
  });

  test('invalid credentials show a generic message', async () => {
    fakeServer({
      'POST /auth/login': {
        status: 401,
        error: { code: 'UNAUTHENTICATED', message: 'No user with that email' },
      },
    });
    mountApp(null);
    fireEvent.changeText(await screen.findByLabelText('Email'), 'nobody@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await act(async () => fireEvent.press(screen.getByTestId('login-submit')));
    expect(await screen.findByText('Invalid email or password.')).toBeTruthy();
    expect(screen.queryByText(/No user with that email/)).toBeNull();
  });

  test('a suspended membership shows the no-access screen', async () => {
    await tokens.store({ refreshToken: 'refresh-1' });
    fakeServer({
      'POST /auth/refresh': { status: 403, error: { code: 'FORBIDDEN', message: 'suspended' } },
    });
    mountApp();
    expect(await screen.findByText('Your access to this organization is not active')).toBeTruthy();
  });

  test('switching organization from the drawer resets to Home of the new organization', async () => {
    await tokens.store({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const orgB = makeSession({
      organization: ORG_B,
      membership: { id: 80, role: { key: 'sales', name: 'Sales' } },
    });
    fakeServer({ ...homeRoutes, 'POST /auth/switch-organization': { data: withTokens(orgB, 2) } });
    mountApp(makeSession());
    expect(await screen.findByText('Hello, Asha')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText(`Switch to ${ORG_B.name}`)));
    await waitFor(() => expect(screen.getAllByText(ORG_B.name).length).toBeGreaterThan(0));
    expect(tokens.getAccessToken()).toBe('access-2');
  });
});
