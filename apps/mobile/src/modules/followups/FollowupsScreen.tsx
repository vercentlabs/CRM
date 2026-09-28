import type { FollowupScheduleItem, LeadStatus } from '@crm/types';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { FormError, FormActions } from '../../components/forms/pickers';
import { ListRow } from '../../components/lists/PagedList';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  Segmented,
  SelectField,
  Sheet,
  Text,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatRelative } from '../../lib/format';
import { LEAD_STATUS_OPTIONS, LEAD_STATUS_TONE } from '../../lib/labels';
import { useQueryKey, useSession } from '../../providers/SessionProvider';
import { ScheduleFollowupSheet } from '../leads/LeadSheets';
import { useLeadMutations } from '../leads/hooks';

type Tab = 'all' | 'overdue';

/**
 * The follow-up schedule: leads with a next call. "Overdue" is derived from
 * the date, never a stored status. Completing a follow-up records the call
 * outcome on the lead (new status) and clears the next call.
 */
export function FollowupsScreen() {
  const navigation = useNavigation();
  const key = useQueryKey();
  const { can } = useSession();
  const [tab, setTab] = useState<Tab>('all');
  const [reschedule, setReschedule] = useState<FollowupScheduleItem | null>(null);
  const [complete, setComplete] = useState<FollowupScheduleItem | null>(null);
  const schedule = useQuery({
    queryKey: key('followups', 'schedule', tab),
    queryFn: () => api().v1.followups.schedule(tab === 'overdue' ? { overdue: true } : {}),
  });
  const canAct = can('crm.leads.update');

  return (
    <Screen
      title="Follow-ups"
      subtitle={schedule.data ? `${schedule.data.length} scheduled` : undefined}
    >
      <View style={styles.tabs}>
        <Segmented
          label="Follow-up filter"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'Upcoming & due' },
            { value: 'overdue', label: 'Overdue' },
          ]}
        />
      </View>
      {schedule.isPending ? (
        <LoadingState />
      ) : schedule.error ? (
        <ErrorState error={schedule.error} onRetry={() => void schedule.refetch()} />
      ) : (
        <FlatList
          data={schedule.data}
          keyExtractor={(item) => String(item.lead_id)}
          refreshControl={
            <RefreshControl
              refreshing={schedule.isRefetching}
              onRefresh={() => void schedule.refetch()}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="clock"
              title={tab === 'overdue' ? 'Nothing overdue' : 'No follow-ups scheduled'}
              message="Schedule a follow-up from a lead to see it here."
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.lead_name}
              subtitle={[item.lead_mobile, item.assigned_to_name ?? 'Unassigned'].join(' · ')}
              meta={formatDateTime(item.next_call_at)}
              onPress={() => navigation.navigate('LeadDetail', { id: item.lead_id })}
              trailing={
                <View style={styles.trailing}>
                  <Badge
                    label={
                      item.overdue
                        ? `Overdue · ${formatRelative(item.next_call_at)}`
                        : formatRelative(item.next_call_at)
                    }
                    tone={item.overdue ? 'danger' : 'info'}
                  />
                  <Badge
                    label={item.lead_status}
                    tone={LEAD_STATUS_TONE[item.lead_status as LeadStatus] ?? 'neutral'}
                  />
                  {canAct ? (
                    <View style={styles.actions}>
                      <Button label="Reschedule" onPress={() => setReschedule(item)} />
                      <Button label="Done" variant="primary" onPress={() => setComplete(item)} />
                    </View>
                  ) : null}
                </View>
              }
            />
          )}
        />
      )}
      <ScheduleFollowupSheet
        lead={reschedule ? { id: reschedule.lead_id, full_name: reschedule.lead_name } : null}
        onClose={() => setReschedule(null)}
      />
      {complete ? (
        <CompleteSheet key={complete.lead_id} item={complete} onClose={() => setComplete(null)} />
      ) : null}
    </Screen>
  );
}

function CompleteSheet({ item, onClose }: { item: FollowupScheduleItem; onClose: () => void }) {
  const { update } = useLeadMutations();
  const toast = useToast();
  const [status, setStatus] = useState<string | null>(item.lead_status);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      await update.mutateAsync({
        id: item.lead_id,
        input: { status: (status ?? item.lead_status) as LeadStatus, next_call_at: null },
      });
      toast.success('Follow-up completed', item.lead_name);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Log call outcome"
      subtitle={item.lead_name}
      busy={update.isPending}
    >
      <FormError message={error} />
      <Text color="muted">
        The next call is cleared. Schedule another follow-up from the lead if needed.
      </Text>
      <SelectField
        label="Lead status after the call"
        value={status}
        onChange={setStatus}
        options={LEAD_STATUS_OPTIONS}
      />
      <FormActions
        submitLabel="Complete"
        saving={update.isPending}
        onSubmit={() => void submit()}
        onCancel={onClose}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tabs: { padding: 16, paddingBottom: 8 },
  trailing: { alignItems: 'flex-end', gap: 4 },
  actions: { flexDirection: 'row', gap: 6 },
});
