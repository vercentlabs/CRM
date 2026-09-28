import axe from 'axe-core';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from '@/components/navigation/AppShell';
import { LeadsScreen } from '@/modules/leads/LeadsScreen';
import { LoginScreen } from '@/modules/auth/AuthScreens';
import { lead } from './fixtures';
import { ADMIN, makeSession, mockApi, page, renderApp } from './harness';

/**
 * Automated accessibility checks (axe-core) on representative screens. jsdom
 * cannot compute layout, so colour contrast is covered by the token choices
 * and checked in the browser suite instead.
 */
async function violations(container: Element) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`);
}

describe('accessibility', () => {
  it('sign-in form has no violations', async () => {
    const { container } = renderApp(<LoginScreen />, { api: mockApi(), session: null });
    expect(await violations(container)).toEqual([]);
  });

  it('app shell and leads list have no violations', async () => {
    const api = mockApi()
      .on('GET /api/v1/leads', page([lead({ full_name: 'Priya Shah' })]))
      .on('GET /api/v1/organization/members', page([], 1, 100))
      .on('GET /api/v1/chat/conversations', { body: { success: true, data: [] } });
    const { container } = renderApp(
      <AppShell>
        <LeadsScreen />
      </AppShell>,
      { api, session: makeSession(ADMIN) },
    );
    await screen.findByRole('link', { name: 'Priya Shah' });
    expect(await violations(container)).toEqual([]);
  });

  it('lead form sheet has labelled controls and no violations', async () => {
    const api = mockApi()
      .on('GET /api/v1/leads', page([]))
      .on('GET /api/v1/organization/members', page([], 1, 100));
    renderApp(<LeadsScreen />, { api, session: makeSession(ADMIN) });
    await screen.findByText('No leads yet');
    fireEvent.click(screen.getAllByRole('button', { name: /New lead/ })[0]!);
    const sheet = await screen.findByRole('dialog', { name: 'New lead' });
    expect(within(sheet).getByLabelText(/Full name/)).toBeTruthy();
    expect(await violations(sheet)).toEqual([]);
  });
});
