import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotificationBell } from '@/modules/notifications/NotificationBell';
import { ADMIN, makeSession, mockApi, ok, page, renderApp } from './harness';

const notification = (id: string, title: string, read = false) => ({
  id,
  type: 'lead.assigned',
  title,
  body: 'Priya Shah',
  entity_type: 'lead',
  entity_id: 12,
  read_at: read ? new Date().toISOString() : null,
  created_at: new Date().toISOString(),
});

describe('notification bell', () => {
  it('shows the unread count, lists notifications and marks them read', async () => {
    const api = mockApi()
      .on('GET /api/v1/notifications/unread-count', ok({ count: 2 }))
      .on(
        'GET /api/v1/notifications',
        page([
          notification('n1', 'Lead assigned to you'),
          notification('n2', 'Task assigned to you', true),
        ]),
      )
      .on('POST /api/v1/notifications/:id/read', ok({ read: true }))
      .on('POST /api/v1/notifications/read-all', ok({ updated: 1 }));
    renderApp(<NotificationBell />, { api, session: makeSession(ADMIN) });

    const trigger = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    expect(screen.getByTestId('notification-count').textContent).toBe('2');
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    const item = await screen.findByRole('menuitem', { name: /Lead assigned to you — Priya Shah/ });
    expect(screen.getByRole('menuitem', { name: /Task assigned to you/ })).toBeTruthy();
    fireEvent.click(item);
    await waitFor(() => expect(api.find('POST', '/api/v1/notifications/n1/read')).toHaveLength(1));
    // Organization-scoped: the list request carries no user or organization parameters.
    const list = api.find('GET', '/api/v1/notifications')[0]!;
    expect([...list.query.keys()]).toEqual(['limit']);
  });

  it('hides the badge when there is nothing unread', async () => {
    const api = mockApi().on('GET /api/v1/notifications/unread-count', ok({ count: 0 }));
    renderApp(<NotificationBell />, { api, session: makeSession(ADMIN) });
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeTruthy();
    expect(screen.queryByTestId('notification-count')).toBeNull();
  });
});
