import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LeadsScreen } from '@/modules/leads/LeadsScreen';
import { lead, member } from './fixtures';
import { ADMIN, SALES, apiError, makeSession, mockApi, ok, page, renderApp } from './harness';
import { navigation } from './setup';

const members = [
  member({ id: 10, full_name: 'Ana Admin' }),
  member({ id: 20, full_name: 'Sam Sales' }),
];

function adminApi(
  leads = [
    lead({ full_name: 'Priya Shah' }),
    lead({ full_name: 'Omar Khan', status: 'Contacted' }),
  ],
) {
  return mockApi()
    .on('GET /api/v1/leads', (req) =>
      page(leads, Number(req.query.get('page') ?? 1), Number(req.query.get('limit') ?? 20), 45),
    )
    .on('GET /api/v1/organization/members', page(members, 1, 100));
}

describe('leads list', () => {
  it('renders leads from /api/v1 with pagination, sorting and filters in the URL', async () => {
    const api = adminApi();
    navigation.pathname = '/leads';
    renderApp(<LeadsScreen />, { api, session: makeSession(ADMIN) });

    expect(await screen.findByRole('link', { name: 'Priya Shah' })).toBeTruthy();
    expect(screen.getByText('45 leads')).toBeTruthy();
    const first = api.find('GET', '/api/v1/leads')[0]!;
    expect(Object.fromEntries(first.query)).toMatchObject({
      page: '1',
      limit: '20',
      sort: '-created_at',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(navigation.replace).toHaveBeenLastCalledWith('/leads?page=2');

    // Changing a filter resets paging.
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by status' }), {
      target: { value: 'Qualified' },
    });
    expect(navigation.replace).toHaveBeenLastCalledWith('/leads?status=Qualified');

    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(navigation.replace).toHaveBeenLastCalledWith('/leads?sort=full_name');
  });

  it('shows create, export, assign and assignee filter only with the matching permissions', async () => {
    const api = mockApi().on(
      'GET /api/v1/leads',
      page([lead({ full_name: 'Mine', assigned_to: 10 })]),
    );
    renderApp(<LeadsScreen />, { api, session: makeSession(SALES) });
    await screen.findByRole('link', { name: 'Mine' });
    expect(screen.getByRole('button', { name: /New lead/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Export CSV/ })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Filter by assignee' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Mine' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByText('Assign…')).toBeNull();
    expect(within(menu).getByText('Edit')).toBeTruthy();
    // Own scope never lists the member directory.
    expect(api.find('GET', '/api/v1/organization/members')).toHaveLength(0);
  });

  it('offers assignment to organization-wide assigners and sends it to the v1 endpoint', async () => {
    const target = lead({
      id: 501,
      full_name: 'Assign Me',
      assigned_to: null,
      assigned_user_name: null,
    });
    const api = adminApi([target]).on('PUT /api/v1/leads/:id/assignment', (req) =>
      ok({
        ...target,
        assigned_to: (req.body as { assigned_to: number }).assigned_to,
        assigned_user_name: 'Sam Sales',
      }),
    );
    renderApp(<LeadsScreen />, { api, session: makeSession(ADMIN) });
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Assign Me' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Assign…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign lead' });
    await waitFor(() => expect(within(dialog).getAllByRole('option').length).toBeGreaterThan(1));
    fireEvent.change(within(dialog).getByLabelText('Assigned to'), { target: { value: '20' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(api.find('PUT', '/api/v1/leads/501/assignment')).toHaveLength(1));
    expect(api.find('PUT', '/api/v1/leads/501/assignment')[0]!.body).toEqual({ assigned_to: 20 });
  });

  it('validates the create form with the shared schema before calling the API', async () => {
    const user = userEvent.setup();
    const api = mockApi().on('GET /api/v1/leads', page([]));
    renderApp(<LeadsScreen />, { api, session: makeSession(SALES) });
    await screen.findByText('No leads yet');
    await user.click(screen.getAllByRole('button', { name: /New lead/ })[0]!);
    const sheet = await screen.findByRole('dialog', { name: 'New lead' });
    await user.type(within(sheet).getByLabelText(/Mobile number/), '12345');
    await user.click(within(sheet).getByRole('button', { name: 'Create lead' }));
    expect(await within(sheet).findByText('Full name must be a non-empty string')).toBeTruthy();
    expect(
      within(sheet).getByText('Mobile number must be a string of exactly 10 digits'),
    ).toBeTruthy();
    expect(
      within(sheet)
        .getByLabelText(/Full name/)
        .getAttribute('aria-invalid'),
    ).toBe('true');
    expect(api.find('POST', '/api/v1/leads')).toHaveLength(0);
  });

  it('creates a lead and maps server validation errors onto fields', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const api = mockApi()
      .on('GET /api/v1/leads', page([]))
      .on('POST /api/v1/leads', (req) => {
        attempts += 1;
        if (attempts === 1) {
          return apiError(400, 'VALIDATION_FAILED', 'Email must be a valid email address', {
            details: [{ field: 'body.email', message: 'Email already used by another lead' }],
          });
        }
        return { status: 201, ...ok(lead({ id: 900, ...(req.body as object) })) };
      });
    renderApp(<LeadsScreen />, { api, session: makeSession(SALES) });
    await screen.findByText('No leads yet');
    await user.click(screen.getAllByRole('button', { name: /New lead/ })[0]!);
    const sheet = await screen.findByRole('dialog', { name: 'New lead' });
    await user.type(within(sheet).getByLabelText(/Full name/), 'Nia Patel');
    await user.type(within(sheet).getByLabelText(/Mobile number/), '9123456789');
    await user.type(within(sheet).getByLabelText(/^Email/), 'nia@example.test');
    await user.click(within(sheet).getByRole('button', { name: 'Create lead' }));
    expect(await within(sheet).findByText('Email already used by another lead')).toBeTruthy();

    await user.click(within(sheet).getByRole('button', { name: 'Create lead' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/leads/900'));
    const sent = api.find('POST', '/api/v1/leads')[1]!;
    expect(sent.body).toMatchObject({
      full_name: 'Nia Patel',
      mobile_number: '9123456789',
      email: 'nia@example.test',
      status: 'New',
    });
    // Own-scope creators never send an assignee; the API assigns them.
    expect(sent.body).not.toHaveProperty('assigned_to');
    expect(sent.headers['x-csrf-token']).toBe('csrf-test');
    expect(await screen.findByText('Lead created')).toBeTruthy();
  });

  it('edits a lead with PATCH', async () => {
    const user = userEvent.setup();
    const existing = lead({ id: 77, full_name: 'Edit Me', assigned_to: 10 });
    const api = mockApi()
      .on('GET /api/v1/leads', page([existing]))
      .on('PATCH /api/v1/leads/:id', (req) => ok({ ...existing, ...(req.body as object) }));
    renderApp(<LeadsScreen />, { api, session: makeSession(SALES) });
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Edit Me' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit lead' });
    const name = within(sheet).getByLabelText(/Full name/);
    await user.clear(name);
    await user.type(name, 'Edited Name');
    await act(async () => user.click(within(sheet).getByRole('button', { name: 'Save changes' })));
    await waitFor(() => expect(api.find('PATCH', '/api/v1/leads/77')).toHaveLength(1));
    expect(api.find('PATCH', '/api/v1/leads/77')[0]!.body).toMatchObject({
      full_name: 'Edited Name',
    });
  });

  it('shows the permission-denied state when the API refuses the list', async () => {
    const api = mockApi().on(
      'GET /api/v1/leads',
      apiError(403, 'FORBIDDEN', 'You do not have permission'),
    );
    renderApp(<LeadsScreen />, { api, session: makeSession(SALES) });
    expect(await screen.findByText("You don't have access to this")).toBeTruthy();
  });
});
