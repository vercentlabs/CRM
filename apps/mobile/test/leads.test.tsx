import type { Lead } from '@crm/types';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { LeadDetailScreen } from '../src/modules/leads/LeadDetailScreen';
import { LeadFormScreen } from '../src/modules/leads/LeadFormScreen';
import { LeadsScreen } from '../src/modules/leads/LeadsScreen';
import { fakeServer, makeSession, page, renderScreen } from './helpers';

const lead = (id: number, overrides: Partial<Lead> = {}): Lead => ({
  id,
  full_name: `Lead ${id}`,
  mobile_number: '98765432' + String(id).padStart(2, '0'),
  alternate_number: null,
  email: null,
  source: null,
  notes: null,
  age: null,
  address: null,
  occupation: null,
  monthly_income: null,
  is_aware_of_digital_gold: false,
  status: 'New',
  next_call_at: null,
  created_by: 7,
  assigned_to: 7,
  location_id: null,
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
  assigned_user_name: 'Asha Rao',
  location_name: null,
  ...overrides,
});

const ownSales = makeSession({
  membership: { id: 71, role: { key: 'sales', name: 'Sales' } },
  permissions: { 'crm.leads.read': 'own', 'crm.leads.update': 'own' },
});

describe('leads list', () => {
  test('renders the first page and loads the next one on demand', async () => {
    const server = fakeServer({
      'GET /leads': (call) => {
        const n = Number(call.query.get('page'));
        const items = Array.from({ length: n === 1 ? 20 : 5 }, (_, i) =>
          lead((n - 1) * 20 + i + 1),
        );
        return page(items, n, 25, 20);
      },
    });
    renderScreen(LeadsScreen);
    expect(await screen.findByText('Lead 1')).toBeTruthy();
    expect(screen.getByText('25 leads')).toBeTruthy();
    expect(server.find('GET', '/leads')[0]!.query.get('limit')).toBe('20');

    fireEvent(screen.getByTestId('paged-list'), 'onEndReached');
    await waitFor(() =>
      expect(server.find('GET', '/leads').some((c) => c.query.get('page') === '2')).toBe(true),
    );
  });

  test('search is debounced and sent to the server', async () => {
    jest.useFakeTimers();
    try {
      const server = fakeServer({ 'GET /leads': page([lead(1)]) });
      renderScreen(LeadsScreen);
      await screen.findByText('Lead 1');
      fireEvent.changeText(screen.getByLabelText('Search leads'), 'rav');
      fireEvent.changeText(screen.getByLabelText('Search leads'), 'ravi');
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      await waitFor(() =>
        expect(server.find('GET', '/leads').some((c) => c.query.get('search') === 'ravi')).toBe(
          true,
        ),
      );
      expect(server.find('GET', '/leads').some((c) => c.query.get('search') === 'rav')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('the create action is hidden without crm.leads.create', async () => {
    fakeServer({ 'GET /leads': page([lead(1)]) });
    renderScreen(LeadsScreen, { session: ownSales });
    await screen.findByText('Lead 1');
    expect(screen.queryByLabelText('New lead')).toBeNull();
  });
});

describe('lead form', () => {
  test('invalid input is rejected by the shared schema without a request', async () => {
    const server = fakeServer({});
    renderScreen(LeadFormScreen);
    await act(async () => fireEvent.press(screen.getByTestId('form-submit')));
    expect(await screen.findAllByText(/required|10 digits|must be/i)).not.toHaveLength(0);
    expect(server.find('POST', '/leads')).toHaveLength(0);
  });

  test('creates a lead with the v1 body shape', async () => {
    const server = fakeServer({
      'POST /leads': (call) => ({ status: 201, data: lead(99, call.body as Partial<Lead>) }),
    });
    renderScreen(LeadFormScreen);
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Ravi Kumar');
    fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
    await act(async () => fireEvent.press(screen.getByTestId('form-submit')));
    await waitFor(() => expect(server.find('POST', '/leads')).toHaveLength(1));
    const body = server.find('POST', '/leads')[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({
      full_name: 'Ravi Kumar',
      mobile_number: '9876543210',
      status: 'New',
    });
    expect(body).not.toHaveProperty('roleId');
    expect(body).not.toHaveProperty('organization_id');
  });

  test('server validation errors land on the field', async () => {
    fakeServer({
      'POST /leads': {
        status: 400,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: [{ field: 'body.mobile_number', message: 'Mobile number already exists' }],
        },
      },
    });
    renderScreen(LeadFormScreen);
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Ravi Kumar');
    fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
    await act(async () => fireEvent.press(screen.getByTestId('form-submit')));
    expect(await screen.findByText('Mobile number already exists')).toBeTruthy();
  });
});

describe('lead detail gating', () => {
  test('own-scope members cannot assign and do not see actions they lack', async () => {
    fakeServer({ 'GET /leads/:id': { data: lead(5) } });
    renderScreen(LeadDetailScreen, { session: ownSales, params: { id: 5 } });
    expect(await screen.findByText('Lead 5')).toBeTruthy();
    expect(screen.queryByText('Assign')).toBeNull();
    expect(screen.queryByText('Call')).toBeNull();
    expect(screen.queryByText('Message')).toBeNull();
  });

  test('a 404 (other tenant or deleted) shows not found, not data', async () => {
    fakeServer({
      'GET /leads/:id': { status: 404, error: { code: 'NOT_FOUND', message: 'Lead not found' } },
    });
    renderScreen(LeadDetailScreen, { params: { id: 404 } });
    expect(await screen.findByText('Not found')).toBeTruthy();
  });
});
