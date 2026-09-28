import type { Lead, Task } from '@crm/types';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ListRow } from '../../components/lists/PagedList';
import { Badge, Button, Card, ErrorState, LoadingState, Screen, Text } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime, formatNumber, formatRelative, isPast } from '../../lib/format';
import { LEAD_STATUS_TONE } from '../../lib/labels';
import { useQueryKey, useSession } from '../../providers/SessionProvider';
import { useColors } from '../../theme/ThemeProvider';

/** Today at a glance, built only from what the member's permissions allow. */
export function HomeScreen() {
  const navigation = useNavigation();
  const key = useQueryKey();
  const { user, organization, can } = useSession();
  const summary = useQuery({
    queryKey: key('dashboard', 'summary'),
    queryFn: () => api().v1.reports.dashboardSummary(),
    enabled: can('crm.reports.read'),
  });
  const overdue = useQuery({
    queryKey: key('followups', 'schedule', 'overdue'),
    queryFn: () => api().v1.followups.schedule({ overdue: true }),
    enabled: can('crm.followups.read'),
  });
  const tasks = useQuery({
    queryKey: key('tasks', 'home'),
    queryFn: () => api().v1.tasks.list({ page: 1, limit: 5, status: 'pending', sort: 'due_date' }),
    enabled: can('crm.tasks.read'),
  });
  const leads = useQuery({
    queryKey: key('leads', 'home'),
    queryFn: () => api().v1.leads.list({ page: 1, limit: 5, sort: '-created_at' }),
    enabled: can('crm.leads.read'),
  });
  const gold = useQuery({
    queryKey: key('market', 'gold'),
    queryFn: () => api().v1.market.goldRate(),
    staleTime: 10 * 60_000,
  });

  const queries = [summary, overdue, tasks, leads, gold];
  const refreshing = queries.some((q) => q.isRefetching);
  const refresh = () => void Promise.all(queries.map((q) => (q.isEnabled ? q.refetch() : null)));
  const first = user?.name.split(' ')[0] ?? '';

  return (
    <Screen title={`Hello, ${first}`} subtitle={organization?.name}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {can('crm.reports.read') ? (
          summary.isPending ? (
            <LoadingState />
          ) : summary.error ? (
            <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
          ) : (
            <View style={styles.stats}>
              <Stat label="Leads" value={summary.data.totalLeads} />
              <Stat label="Follow-ups due" value={summary.data.pendingFollowups} />
              <Stat
                label="Overdue"
                value={summary.data.overdueFollowups}
                danger={summary.data.overdueFollowups > 0}
              />
              <Stat label="Calls today" value={summary.data.callsToday} />
              <Stat label="Messages today" value={summary.data.messagesToday} />
            </View>
          )
        ) : null}

        {can('crm.followups.read') ? (
          <Card
            title="Overdue follow-ups"
            action={
              <Button
                label="All"
                variant="ghost"
                onPress={() => navigation.navigate('Main', { screen: 'Followups' })}
              />
            }
          >
            {overdue.isPending ? (
              <LoadingState />
            ) : overdue.error ? (
              <ErrorState error={overdue.error} onRetry={() => void overdue.refetch()} />
            ) : overdue.data.length === 0 ? (
              <Text color="muted">You are all caught up.</Text>
            ) : (
              overdue.data
                .slice(0, 5)
                .map((f) => (
                  <ListRow
                    key={f.lead_id}
                    title={f.lead_name}
                    subtitle={f.lead_mobile}
                    onPress={() => navigation.navigate('LeadDetail', { id: f.lead_id })}
                    trailing={<Badge label={formatRelative(f.next_call_at)} tone="danger" />}
                  />
                ))
            )}
          </Card>
        ) : null}

        {can('crm.tasks.read') ? (
          <Card
            title="Upcoming tasks"
            action={
              <Button
                label="All"
                variant="ghost"
                onPress={() => navigation.navigate('Main', { screen: 'Tasks' })}
              />
            }
          >
            <Rows<Task>
              query={tasks}
              empty="No pending tasks."
              render={(t) => (
                <ListRow
                  key={t.id}
                  title={t.title}
                  subtitle={formatDateTime(t.due_date)}
                  onPress={() => navigation.navigate('TaskForm', { id: t.id })}
                  trailing={
                    isPast(t.due_date) ? <Badge label="Overdue" tone="danger" /> : undefined
                  }
                />
              )}
            />
          </Card>
        ) : null}

        {can('crm.leads.read') ? (
          <Card
            title="Recent leads"
            action={
              <Button
                label="All"
                variant="ghost"
                onPress={() => navigation.navigate('Main', { screen: 'Leads' })}
              />
            }
          >
            <Rows<Lead>
              query={leads}
              empty="No leads yet."
              render={(l) => (
                <ListRow
                  key={l.id}
                  title={l.full_name}
                  subtitle={`Added ${formatRelative(l.created_at)}`}
                  onPress={() => navigation.navigate('LeadDetail', { id: l.id })}
                  trailing={<Badge label={l.status} tone={LEAD_STATUS_TONE[l.status]} />}
                />
              )}
            />
          </Card>
        ) : null}

        {gold.data ? (
          <Card title="Gold rate (per gram)">
            <View style={styles.gold}>
              <Text>22K ₹{formatNumber(gold.data.gold_22k['1g'])}</Text>
              <Text>24K ₹{formatNumber(gold.data.gold_24k['1g'])}</Text>
            </View>
            <Text variant="caption" color="muted">
              Updated {formatRelative(gold.data.updated_at)}
              {gold.data.warning ? ` · ${gold.data.warning}` : ''}
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  const c = useColors();
  return (
    <View
      style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text variant="title" color={danger ? 'danger' : 'fg'}>
        {formatNumber(value)}
      </Text>
      <Text variant="caption" color="muted">
        {label}
      </Text>
    </View>
  );
}

function Rows<T>({
  query,
  empty,
  render,
}: {
  query: {
    data: { items: T[] } | undefined;
    isPending: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  empty: string;
  render: (item: T) => React.ReactElement;
}) {
  if (query.isPending) return <LoadingState />;
  if (query.error || !query.data)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.items.length === 0) return <Text color="muted">{empty}</Text>;
  return <>{query.data.items.map(render)}</>;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: '30%', borderWidth: 1, borderRadius: 12, padding: 12 },
  gold: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
});
