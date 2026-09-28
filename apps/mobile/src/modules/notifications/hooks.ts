import type { Notification } from '@crm/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useQueryKey } from '../../providers/SessionProvider';

/** Polled (no push notifications or realtime channel yet). */
const POLL_MS = 30_000;

export function useUnreadNotifications(): number {
  const key = useQueryKey();
  const query = useQuery({
    queryKey: key('notifications', 'unread'),
    queryFn: () => api().v1.notifications.unreadCount(),
    refetchInterval: POLL_MS,
  });
  return query.data?.count ?? 0;
}

export function useNotificationMutations() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key('notifications') });
  return {
    markRead: useMutation({
      mutationFn: (id: string) => api().v1.notifications.markRead(id),
      onSuccess: invalidate,
    }),
    markAllRead: useMutation({
      mutationFn: () => api().v1.notifications.markAllRead(),
      onSuccess: invalidate,
    }),
  };
}

export type NotificationTarget =
  | { screen: 'LeadDetail'; params: { id: number } }
  | { screen: 'TaskForm'; params: { id: number } }
  | { screen: 'OpportunityForm'; params: { id: number } }
  | null;

/** Where a notification leads in the app (only entities the app can open). */
export function notificationTarget(
  n: Pick<Notification, 'entity_type' | 'entity_id'>,
): NotificationTarget {
  if (n.entity_id === null) return null;
  if (n.entity_type === 'lead') return { screen: 'LeadDetail', params: { id: n.entity_id } };
  if (n.entity_type === 'task') return { screen: 'TaskForm', params: { id: n.entity_id } };
  if (n.entity_type === 'opportunity')
    return { screen: 'OpportunityForm', params: { id: n.entity_id } };
  return null;
}
