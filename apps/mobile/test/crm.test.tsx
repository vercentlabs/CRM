import { ApiClientError } from '@crm/api-client';
import type { Customer, Member, Opportunity, Task } from '@crm/types';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ErrorState } from '../src/components/ui';
import { toDisplayError } from '../src/lib/errors';
import { CustomerFormScreen } from '../src/modules/customers/CustomerFormScreen';
import { CustomersScreen } from '../src/modules/customers/CustomersScreen';
import { OpportunitiesScreen } from '../src/modules/opportunities/OpportunitiesScreen';
import { MembersScreen } from '../src/modules/organization/MembersScreen';
import { SettingsScreen } from '../src/modules/settings/SettingsScreen';
import { TaskFormScreen } from '../src/modules/tasks/TaskFormScreen';
import { TasksScreen } from '../src/modules/tasks/TasksScreen';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { fakeServer, makeSession, page, renderScreen } from './helpers';

const customer: Customer = {
  id: 3,
  name: 'Meera Traders',
  email: 'meera@example.com',
  phone: '9876500000',
  address: null,
  assigned_to: 7,
  created_by: 7,
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
};

const task: Task = {
  id: 11,
  title: 'Send brochure',
  description: null,
  due_date: '2026-09-30T09:00:00.000Z',
  priority: 'high',
  status: 'pending',
  assigned_to: 7,
  created_by: 7,
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
  assigned_to_name: 'Asha Rao',
  assigned_to_email: 'asha@example.com',
};

const opportunity: Opportunity = {
  id: 21,
  lead_id: 1,
  title: 'Gold SIP 50g',
  description: null,
  value: '250000.00',
  stage: 'Proposal',
  probability: 60,
  expected_close_date: '2026-10-15',
  created_by: 7,
  assigned_to: 7,
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
  lead_name: 'Ravi Kumar',
  lead_email: null,
  assigned_to_name: 'Asha Rao',
};

const readOnly = makeSession({
  membership: { id: 72, role: { key: 'viewer', name: 'Viewer' } },
  permissions: {
    'crm.customers.read': 'own',
    'crm.tasks.read': 'own',
    'settings.users.read': 'organization',
  },
});

describe('customers', () => {
  test('lists customers from the v1 page', async () => {
    fakeServer({ 'GET /customers': page([customer]) });
    renderScreen(CustomersScreen);
    expect(await screen.findByText('Meera Traders')).toBeTruthy();
    expect(screen.getByLabelText('New customer')).toBeTruthy();
  });

  test('read-only members get a read-only form without delete', async () => {
    fakeServer({ 'GET /customers/:id': { data: { ...customer, assigned_to: 99 } } });
    renderScreen(CustomerFormScreen, { session: readOnly, params: { id: 3 } });
    expect(await screen.findByText('Customer')).toBeTruthy();
    expect(screen.queryByTestId('form-submit')).toBeNull();
    expect(screen.queryByText('Delete customer')).toBeNull();
  });

  test('updates with PATCH /customers/:id', async () => {
    const server = fakeServer({
      'GET /customers/:id': { data: customer },
      'PATCH /customers/:id': (call) => ({ data: { ...customer, ...(call.body as object) } }),
    });
    renderScreen(CustomerFormScreen, { params: { id: 3 } });
    fireEvent.changeText(await screen.findByLabelText('Phone'), '9123456780');
    await act(async () => fireEvent.press(screen.getByTestId('form-submit')));
    await waitFor(() => expect(server.find('PATCH', '/customers/3')).toHaveLength(1));
    expect(server.find('PATCH', '/customers/3')[0]!.body).toMatchObject({ phone: '9123456780' });
  });
});

describe('opportunities', () => {
  test('filters by stage on the server', async () => {
    const server = fakeServer({ 'GET /opportunities': page([opportunity]) });
    renderScreen(OpportunitiesScreen);
    expect(await screen.findByText('Gold SIP 50g')).toBeTruthy();
    fireEvent.press(screen.getByText('Negotiation'));
    await waitFor(() =>
      expect(
        server.find('GET', '/opportunities').some((c) => c.query.get('stage') === 'Negotiation'),
      ).toBe(true),
    );
  });
});

describe('tasks', () => {
  test('completing a task sends status completed', async () => {
    const server = fakeServer({
      'GET /tasks': page([task]),
      'PATCH /tasks/:id': (call) => ({ data: { ...task, ...(call.body as object) } }),
    });
    renderScreen(TasksScreen);
    await act(async () => fireEvent.press(await screen.findByLabelText('Complete Send brochure')));
    await waitFor(() =>
      expect(server.find('PATCH', '/tasks/11')[0]?.body).toEqual({ status: 'completed' }),
    );
  });

  test('own-scope creators do not get an assignee picker', async () => {
    fakeServer({});
    renderScreen(TaskFormScreen, {
      session: makeSession({ permissions: { 'crm.tasks.read': 'own', 'crm.tasks.create': 'own' } }),
    });
    expect(await screen.findByText('Tasks you create are assigned to you.')).toBeTruthy();
    expect(screen.queryByText('Assigned to')).toBeNull();
  });
});

describe('admin controls', () => {
  const member: Member = {
    id: 8,
    full_name: 'Kiran Shah',
    email: 'kiran@example.com',
    username: 'kiran',
    role_key: 'sales',
    role_name: 'Sales',
    membership_id: 80,
    membership_status: 'active',
    is_active: true,
  } as Member;

  test('members without settings.users.manage cannot add or change members', async () => {
    fakeServer({
      'GET /organization/members': page([member]),
      'GET /organization/roles': { data: [] },
    });
    renderScreen(MembersScreen, { session: readOnly });
    fireEvent.press(await screen.findByText('Kiran Shah'));
    expect(screen.queryByLabelText('Add member')).toBeNull();
    expect(await screen.findByText('Only members who manage users can change this.')).toBeTruthy();
    expect(screen.queryByText('Suspend member')).toBeNull();
  });

  test('admins can suspend other members but not themselves', async () => {
    fakeServer({
      'GET /organization/members': page([member, { ...member, id: 7, full_name: 'Asha Rao' }]),
      'GET /organization/roles': { data: [] },
    });
    renderScreen(MembersScreen);
    expect(await screen.findByLabelText('Add member')).toBeTruthy();
    fireEvent.press(await screen.findByText('Asha Rao'));
    expect(await screen.findByText('You cannot change your own role or status.')).toBeTruthy();
  });

  test('organization settings are hidden without settings.organization.manage', async () => {
    fakeServer({});
    renderScreen(SettingsScreen, {
      session: makeSession({ permissions: { 'settings.audit.read': 'organization' } }),
    });
    expect(await screen.findByText('Audit log')).toBeTruthy();
    expect(screen.queryByText('Save settings')).toBeNull();
    expect(screen.queryByText('Email delivery')).toBeNull();
  });
});

describe('error mapping', () => {
  const err = (status: number, code = 'X', message = 'server said') =>
    new ApiClientError({ status, code: code as never, message, requestId: 'req-1' });

  test.each([
    [0, 'network', 'You appear to be offline'],
    [401, 'unauthenticated', 'Session expired'],
    [403, 'forbidden', "You don't have access"],
    [404, 'not-found', 'Not found'],
    [500, 'server', 'Server error'],
  ])('status %i maps to %s', (status, kind, title) => {
    const display = toDisplayError(err(status, status === 0 ? 'NETWORK_ERROR' : 'X'));
    expect(display).toMatchObject({ kind, title, requestId: 'req-1' });
  });

  test('server (5xx) messages are never shown verbatim', () => {
    expect(toDisplayError(err(500, 'INTERNAL', 'SELECT * FROM users failed')).message).not.toMatch(
      /SELECT/,
    );
  });

  test('403 renders the permission panel and 5xx shows a reference id', () => {
    const { rerender } = render(
      <ThemeProvider>
        <ErrorState error={err(403)} />
      </ThemeProvider>,
    );
    expect(screen.getByText("You don't have access to this")).toBeTruthy();
    rerender(
      <ThemeProvider>
        <ErrorState error={err(502)} onRetry={() => undefined} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Reference: req-1')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });
});

describe('organization time zone', () => {
  it('formats dates in the active organization zone with a safe fallback', () => {
    const format = require('../src/lib/format') as typeof import('../src/lib/format');
    format.setDisplayTimeZone('Asia/Kolkata');
    expect(format.displayTimeZone()).toBe('Asia/Kolkata');
    const kolkata = format.formatDateTime('2026-07-01T18:45:00Z');
    format.setDisplayTimeZone('America/New_York');
    const newYork = format.formatDateTime('2026-07-01T18:45:00Z');
    expect(kolkata).not.toBe(newYork);
    expect(kolkata).toMatch(/Jul 2, 2026|2 Jul 2026/);
    expect(newYork).toMatch(/Jul 1, 2026|1 Jul 2026/);
    format.setDisplayTimeZone('Not/AZone');
    expect(format.displayTimeZone()).toBe('UTC');
  });
});
