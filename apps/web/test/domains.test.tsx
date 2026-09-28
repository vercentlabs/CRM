import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { visibleNavigation } from '@/components/navigation/navigation';
import { CustomersScreen } from '@/modules/customers/CustomersScreen';
import { OpportunitiesScreen } from '@/modules/opportunities/OpportunitiesScreen';
import { can, canAny, canOrg } from '@/lib/permissions';
import { customer, opportunity } from './fixtures';
import { ADMIN, SALES, makeSession, mockApi, ok, page, renderApp } from './harness';

describe('permission-driven navigation', () => {
  const labels = (permissions: Record<string, 'own' | 'organization'>) =>
    visibleNavigation((...list) => canAny(permissions, list)).flatMap((g) =>
      g.items.map((i) => i.label),
    );

  it('shows administration only with settings permissions', () => {
    expect(labels(ADMIN)).toEqual(
      expect.arrayContaining(['Members', 'Settings', 'Reports', 'Locations']),
    );
    const sales = labels(SALES);
    expect(sales).toEqual(
      expect.arrayContaining(['Dashboard', 'Leads', 'Customers', 'Team chat', 'Reports']),
    );
    expect(sales).not.toContain('Members');
    expect(sales).not.toContain('Settings');
    expect(sales).not.toContain('Calls');
    expect(sales).not.toContain('Locations');
  });

  it('distinguishes granted, organization-wide and missing permissions', () => {
    expect(can(SALES, 'crm.leads.read')).toBe(true);
    expect(canOrg(SALES, 'crm.leads.read')).toBe(false);
    expect(canOrg(ADMIN, 'crm.leads.read')).toBe(true);
    expect(can(SALES, 'settings.users.manage')).toBe(false);
  });
});

describe('customers', () => {
  it('creates, edits and deletes (with confirmation) through /api/v1', async () => {
    const user = userEvent.setup();
    const acme = customer({ id: 31, name: 'Acme Ltd', email: 'ops@acme.test' });
    const api = mockApi()
      .on('GET /api/v1/customers', page([acme]))
      .on('GET /api/v1/organization/members', page([], 1, 100))
      .on('POST /api/v1/customers', (req) => ({ status: 201, ...ok(customer(req.body as object)) }))
      .on('PATCH /api/v1/customers/:id', (req) => ok({ ...acme, ...(req.body as object) }))
      .on('DELETE /api/v1/customers/:id', ok({ deleted: true }));
    renderApp(<CustomersScreen />, { api, session: makeSession(ADMIN) });
    await screen.findByText('Acme Ltd');

    await user.click(screen.getByRole('button', { name: /New customer/ }));
    let sheet = await screen.findByRole('dialog', { name: 'New customer' });
    await user.click(within(sheet).getByRole('button', { name: 'Create customer' }));
    expect(await within(sheet).findByText('Name is required')).toBeTruthy();
    await user.type(within(sheet).getByLabelText(/^Name/), 'Globex');
    await user.type(within(sheet).getByLabelText(/^Email/), 'hi@globex.test');
    await user.click(within(sheet).getByRole('button', { name: 'Create customer' }));
    await waitFor(() => expect(api.find('POST', '/api/v1/customers')).toHaveLength(1));
    expect(api.find('POST', '/api/v1/customers')[0]!.body).toMatchObject({
      name: 'Globex',
      email: 'hi@globex.test',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Acme Ltd' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    sheet = await screen.findByRole('dialog', { name: 'Edit customer' });
    await user.type(within(sheet).getByLabelText(/^Phone/), '555-0101');
    await user.click(within(sheet).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.find('PATCH', '/api/v1/customers/31')).toHaveLength(1));
    expect(api.find('PATCH', '/api/v1/customers/31')[0]!.body).toMatchObject({ phone: '555-0101' });

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Acme Ltd' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete customer?' });
    expect(api.find('DELETE', '/api/v1/customers/31')).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Delete customer' }));
    await waitFor(() => expect(api.find('DELETE', '/api/v1/customers/31')).toHaveLength(1));
  });

  it('hides delete without the delete permission', async () => {
    const api = mockApi().on(
      'GET /api/v1/customers',
      page([customer({ name: 'Mine', assigned_to: 10 })]),
    );
    renderApp(<CustomersScreen />, { api, session: makeSession(SALES) });
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Mine' }));
    expect(screen.queryByRole('menuitem', { name: 'Delete…' })).toBeNull();
  });
});

describe('opportunities', () => {
  it('changes the stage inline with a PATCH', async () => {
    const deal = opportunity({ id: 61, title: 'Big deal', stage: 'Proposal' });
    const api = mockApi()
      .on('GET /api/v1/opportunities', page([deal]))
      .on('PATCH /api/v1/opportunities/:id', (req) => ok({ ...deal, ...(req.body as object) }));
    renderApp(<OpportunitiesScreen />, { api, session: makeSession(ADMIN) });
    const stage = await screen.findByRole('combobox', { name: 'Stage of Big deal' });
    fireEvent.change(stage, { target: { value: 'Negotiation' } });
    await waitFor(() => expect(api.find('PATCH', '/api/v1/opportunities/61')).toHaveLength(1));
    expect(api.find('PATCH', '/api/v1/opportunities/61')[0]!.body).toEqual({
      stage: 'Negotiation',
    });
  });

  it('shows the stage read-only for records outside the own scope', async () => {
    const other = opportunity({ title: 'Theirs', assigned_to: 99, created_by: 99 });
    const api = mockApi().on('GET /api/v1/opportunities', page([other]));
    renderApp(<OpportunitiesScreen />, { api, session: makeSession(SALES) });
    await screen.findByText('Theirs');
    expect(screen.queryByRole('combobox', { name: 'Stage of Theirs' })).toBeNull();
  });

  it('requires a lead before creating', async () => {
    const user = userEvent.setup();
    const api = mockApi()
      .on('GET /api/v1/opportunities', page([]))
      .on('GET /api/v1/leads', page([]));
    renderApp(<OpportunitiesScreen />, { api, session: makeSession(SALES) });
    await screen.findByText('No opportunities yet');
    await user.click(screen.getAllByRole('button', { name: /New opportunity/ })[0]!);
    const sheet = await screen.findByRole('dialog', { name: 'New opportunity' });
    await user.type(within(sheet).getByLabelText(/Title/), 'Expansion');
    await user.click(within(sheet).getByRole('button', { name: 'Create opportunity' }));
    expect(await within(sheet).findByText('Lead ID and title are required')).toBeTruthy();
    expect(api.find('POST', '/api/v1/opportunities')).toHaveLength(0);
  });
});
