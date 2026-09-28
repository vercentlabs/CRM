import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { notificationTarget } from '../src/modules/notifications/hooks';
import { NotificationsScreen } from '../src/modules/notifications/NotificationsScreen';
import { fakeServer, page, renderScreen } from './helpers';

const notification = (
  id: string,
  title: string,
  read = false,
  entity: 'lead' | 'task' | 'opportunity' = 'lead',
) => ({
  id,
  type: `${entity}.assigned`,
  title,
  body: 'Priya Shah',
  entity_type: entity,
  entity_id: 12,
  read_at: read ? '2026-09-01T10:00:00.000Z' : null,
  created_at: new Date().toISOString(),
});

describe('notifications', () => {
  test('lists my notifications with the unread count and marks one read when opened', async () => {
    const server = fakeServer({
      'GET /notifications/unread-count': { data: { count: 1 } },
      'GET /notifications': page([
        notification('n1', 'Lead assigned to you'),
        notification('n2', 'Task due soon', true, 'task'),
      ]),
      'POST /notifications/:id/read': { data: { read: true } },
      'POST /notifications/read-all': { data: { updated: 1 } },
    });
    renderScreen(NotificationsScreen);
    expect(await screen.findByText('Lead assigned to you')).toBeTruthy();
    expect(screen.getByText('Task due soon')).toBeTruthy();
    expect(await screen.findByText('1 unread')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByLabelText('Mark all as read')));
    await waitFor(() => expect(server.find('POST', '/notifications/read-all')).toHaveLength(1));

    // Opening an unread notification marks it read and navigates to its lead.
    await act(async () => fireEvent.press(screen.getByText('Lead assigned to you')));
    await waitFor(() => expect(server.find('POST', '/notifications/n1/read')).toHaveLength(1));
    expect(server.find('POST', /\/notifications\/n2\/read/)).toHaveLength(0);
    // The list is the caller's own: no user or organization parameters are sent.
    expect([...server.find('GET', '/notifications')[0]!.query.keys()].sort()).toEqual([
      'limit',
      'page',
    ]);
  });

  test('shows an empty state', async () => {
    fakeServer({
      'GET /notifications/unread-count': { data: { count: 0 } },
      'GET /notifications': page([]),
    });
    renderScreen(NotificationsScreen);
    expect(await screen.findByText('You are all caught up')).toBeTruthy();
    expect(screen.queryByLabelText('Mark all as read')).toBeNull();
  });

  test('routes entities to screens the app can open', () => {
    expect(notificationTarget({ entity_type: 'lead', entity_id: 3 })).toEqual({
      screen: 'LeadDetail',
      params: { id: 3 },
    });
    expect(notificationTarget({ entity_type: 'task', entity_id: 4 })).toEqual({
      screen: 'TaskForm',
      params: { id: 4 },
    });
    expect(notificationTarget({ entity_type: null, entity_id: null })).toBeNull();
  });
});
