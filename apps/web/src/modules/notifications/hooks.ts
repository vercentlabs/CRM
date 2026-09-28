'use client';

import type { Notification } from '@crm/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useQueryKey } from '@/providers/SessionProvider';

/** Notifications are polled (no realtime channel yet). */
const POLL_MS = 30_000;

export function useUnreadCount() {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('notifications', 'unread'),
    queryFn: () => api().v1.notifications.unreadCount(),
    refetchInterval: POLL_MS,
  });
}

export function useRecentNotifications(enabled: boolean) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('notifications', 'recent'),
    queryFn: () => api().v1.notifications.list({ limit: 10 }),
    enabled,
  });
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

/** In-app route for a notification's entity (only entities the web app can show). */
export function notificationHref(
  n: Pick<Notification, 'entity_type' | 'entity_id'>,
): string | null {
  if (n.entity_id === null) return null;
  if (n.entity_type === 'lead') return `/leads/${n.entity_id}`;
  if (n.entity_type === 'task') return '/tasks';
  if (n.entity_type === 'opportunity') return '/opportunities';
  return null;
}
