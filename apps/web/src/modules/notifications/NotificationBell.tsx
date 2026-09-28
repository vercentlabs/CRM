'use client';

import { BellIcon, DropdownMenu } from '@crm/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatRelative } from '@/lib/format';
import {
  notificationHref,
  useNotificationMutations,
  useRecentNotifications,
  useUnreadCount,
} from './hooks';

/** Topbar bell: unread badge, latest notifications, mark read / mark all read. */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount().data?.count ?? 0;
  const recent = useRecentNotifications(open);
  const { markRead, markAllRead } = useNotificationMutations();
  const items = recent.data?.items ?? [];

  return (
    <span
      onPointerDown={() => setOpen(true)}
      onKeyDown={() => setOpen(true)}
      onFocus={() => setOpen(true)}
    >
      <DropdownMenu
        label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        trigger={
          <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-muted">
            <BellIcon className="h-5 w-5" aria-hidden />
            {unread > 0 && (
              <span
                data-testid="notification-count"
                className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white"
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </span>
        }
        header={<p className="font-medium">Notifications</p>}
        items={[
          ...(recent.isPending
            ? [{ label: 'Loading…', disabled: true, onSelect: () => undefined }]
            : items.length === 0
              ? [{ label: 'You are all caught up', disabled: true, onSelect: () => undefined }]
              : items.map((n) => ({
                  label: `${n.read_at ? '' : '● '}${n.title}${n.body ? ` — ${n.body}` : ''} · ${formatRelative(n.created_at)}`,
                  onSelect: () => {
                    if (!n.read_at) markRead.mutate(n.id);
                    const href = notificationHref(n);
                    if (href) router.push(href);
                  },
                }))),
          ...(unread > 0
            ? [{ label: 'Mark all as read', onSelect: () => markAllRead.mutate() }]
            : []),
        ]}
      />
    </span>
  );
}
