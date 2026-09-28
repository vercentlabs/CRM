import type { Notification } from '@crm/types';
import { useNavigation } from '@react-navigation/native';
import { View } from 'react-native';
import { ListRow, PagedList, usePagedQuery } from '../../components/lists/PagedList';
import { Badge, EmptyState, IconButton, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { notificationTarget, useNotificationMutations, useUnreadNotifications } from './hooks';

/** My in-app notifications in the active organization (newest first). */
export function NotificationsScreen() {
  const navigation = useNavigation();
  const unread = useUnreadNotifications();
  const { markRead, markAllRead } = useNotificationMutations();
  const list = usePagedQuery<Notification>(['notifications', 'list'], (page) =>
    api().v1.notifications.list({ page, limit: 20 }),
  );

  const open = (n: Notification) => {
    if (!n.read_at) markRead.mutate(n.id);
    const target = notificationTarget(n);
    if (target) navigation.navigate(target.screen, target.params);
  };

  return (
    <Screen
      title="Notifications"
      subtitle={unread > 0 ? `${unread} unread` : undefined}
      actions={
        unread > 0 ? (
          <IconButton
            icon="check-circle"
            label="Mark all as read"
            onPress={() => markAllRead.mutate()}
          />
        ) : null
      }
    >
      <PagedList
        query={list}
        keyExtractor={(n) => n.id}
        empty={
          <EmptyState
            icon="bell"
            title="You are all caught up"
            message="Assignments and reminders appear here."
          />
        }
        renderItem={(n) => (
          <ListRow
            title={n.title}
            subtitle={n.body}
            meta={formatRelative(n.created_at)}
            onPress={() => open(n)}
            accessibilityHint={n.read_at ? undefined : 'Unread. Opens and marks it as read.'}
            trailing={n.read_at ? <View /> : <Badge label="New" tone="info" />}
          />
        )}
      />
    </Screen>
  );
}
