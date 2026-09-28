import type { LeadMessage } from '@crm/types';
import { useNavigation } from '@react-navigation/native';
import { ListRow, PagedList, usePagedQuery } from '../../components/lists/PagedList';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  PermissionDenied,
  Screen,
} from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { MESSAGE_STATUS_TONE, messageFailureLabel } from '../../lib/labels';
import { useSession } from '../../providers/SessionProvider';

/** SMS/WhatsApp messages sent to leads (not internal chat). */
export function MessagesScreen() {
  const navigation = useNavigation();
  const { can } = useSession();
  const canRead = can('crm.messages.read');
  const canBulk = can('crm.messages.send') && can('crm.leads.read');
  const list = usePagedQuery<LeadMessage>(
    ['messages', 'list'],
    (page) => api().v1.messages.list({ page, limit: 20 }),
    canRead,
  );
  const bulk = canBulk ? (
    <Button
      label="Bulk message"
      variant="primary"
      icon="send"
      onPress={() => navigation.navigate('BulkMessage')}
    />
  ) : undefined;
  return (
    <Screen
      title="Lead messages"
      subtitle={list.total !== undefined ? `${list.total} messages` : undefined}
      actions={
        canBulk ? (
          <IconButton
            icon="send"
            label="Bulk message"
            onPress={() => navigation.navigate('BulkMessage')}
          />
        ) : null
      }
    >
      {canRead ? (
        <PagedList
          query={list}
          keyExtractor={(m) => m.id}
          empty={
            <EmptyState
              icon="message-square"
              title="No messages yet"
              message="Messages sent to leads appear here."
              action={bulk}
            />
          }
          renderItem={(m) => (
            <ListRow
              title={m.lead_name}
              subtitle={m.content}
              meta={[
                m.message_type,
                formatDateTime(m.sent_at ?? m.created_at),
                m.status === 'Failed' ? messageFailureLabel(m.failure_code) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => navigation.navigate('LeadDetail', { id: m.lead_id })}
              trailing={<Badge label={m.status} tone={MESSAGE_STATUS_TONE[m.status]} />}
            />
          )}
        />
      ) : (
        <PermissionDenied message="You can send messages to leads, but your role cannot view message history." />
      )}
    </Screen>
  );
}
