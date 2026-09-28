import type { Call } from '@crm/types';
import { useNavigation } from '@react-navigation/native';
import { ListRow, PagedList, usePagedQuery } from '../../components/lists/PagedList';
import { Badge, EmptyState, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime, formatDuration } from '../../lib/format';
import { CALL_STATUS_LABEL, CALL_STATUS_TONE } from '../../lib/labels';

/** Call history. Calls start from a lead; telephony runs server-side. */
export function CallsScreen() {
  const navigation = useNavigation();
  const list = usePagedQuery<Call>(['calls', 'list'], (page) =>
    api().v1.calls.list({ page, limit: 20 }),
  );
  return (
    <Screen title="Calls" subtitle={list.total !== undefined ? `${list.total} calls` : undefined}>
      <PagedList
        query={list}
        keyExtractor={(c) => c.id}
        empty={
          <EmptyState
            icon="phone"
            title="No calls yet"
            message="Start a call from a lead to see it here."
          />
        }
        renderItem={(call) => (
          <ListRow
            title={call.lead_name}
            subtitle={[
              formatDateTime(call.start_time),
              call.duration_seconds != null ? formatDuration(call.duration_seconds) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            meta={call.outcome ?? call.notes ?? undefined}
            onPress={() => navigation.navigate('LeadDetail', { id: call.lead_id })}
            trailing={
              <Badge
                label={CALL_STATUS_LABEL[call.call_status]}
                tone={CALL_STATUS_TONE[call.call_status]}
              />
            }
          />
        )}
      />
    </Screen>
  );
}
