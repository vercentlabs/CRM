import type { LeadStatus, ReportPeriod, SalesPerformanceRow } from '@crm/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  Segmented,
  Sheet,
  Text,
} from '../../components/ui';
import { api } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { LEAD_STATUS_TONE } from '../../lib/labels';
import { useQueryKey, useSession } from '../../providers/SessionProvider';
import { useColors } from '../../theme/ThemeProvider';

const DAYS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];
const PERIODS: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];
const AGING: Array<[key: '0-1_days' | '2-3_days' | '4-7_days' | '7+_days', label: string]> = [
  ['0-1_days', '0–1 days'],
  ['2-3_days', '2–3 days'],
  ['4-7_days', '4–7 days'],
  ['7+_days', '7+ days'],
];

/**
 * Reports over the viewer's scope (own records, or the organization with an
 * organization-wide grant). Team performance needs organization scope.
 */
export function ReportsScreen() {
  const key = useQueryKey();
  const { scopeOf } = useSession();
  const orgScope = scopeOf('crm.reports.read') === 'organization';
  const [days, setDays] = useState('30');
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [member, setMember] = useState<SalesPerformanceRow | null>(null);

  const conversion = useQuery({
    queryKey: key('reports', 'conversion', days),
    queryFn: () => api().v1.reports.conversion({ days: Number(days) }),
  });
  const aging = useQuery({
    queryKey: key('reports', 'aging'),
    queryFn: () => api().v1.reports.leadAging(),
  });
  const overTime = useQuery({
    queryKey: key('reports', 'over-time', period),
    queryFn: () => api().v1.reports.leadsOverTime({ period }),
  });
  const team = useQuery({
    queryKey: key('reports', 'team', days),
    queryFn: () => api().v1.reports.salesPerformance({ days: Number(days) }),
    enabled: orgScope,
  });
  const refreshing =
    conversion.isRefetching || aging.isRefetching || overTime.isRefetching || team.isRefetching;
  const refresh = () =>
    void Promise.all([
      conversion.refetch(),
      aging.refetch(),
      overTime.refetch(),
      orgScope ? team.refetch() : null,
    ]);

  return (
    <Screen title="Reports" subtitle={orgScope ? 'Organization' : 'My records'}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <Segmented label="Report range" value={days} onChange={setDays} options={DAYS} />

        <Card title="Lead conversion">
          <QueryBody query={conversion}>
            {(data) => {
              const rows = (Object.entries(data) as Array<[LeadStatus, number]>).filter(
                ([, n]) => n > 0,
              );
              const total = rows.reduce((s, [, n]) => s + n, 0);
              const converted = data.Converted ?? 0;
              return total === 0 ? (
                <Text color="muted">No leads in this range.</Text>
              ) : (
                <>
                  <Text variant="title">
                    {total ? `${((converted / total) * 100).toFixed(1)}%` : '—'}
                  </Text>
                  <Text variant="caption" color="muted">
                    {converted} of {total} leads converted
                  </Text>
                  <Bars
                    rows={rows.map(([status, n]) => ({
                      label: status,
                      value: n,
                      tone: LEAD_STATUS_TONE[status],
                    }))}
                  />
                </>
              );
            }}
          </QueryBody>
        </Card>

        <Card
          title="New leads"
          action={
            <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS} />
          }
        >
          <QueryBody query={overTime}>
            {(points) =>
              points.length === 0 ? (
                <Text color="muted">No new leads in this period.</Text>
              ) : (
                <Bars rows={points.map((p) => ({ label: p.time, value: p.leads }))} />
              )
            }
          </QueryBody>
        </Card>

        <Card title="Lead aging (open leads)">
          <QueryBody query={aging}>
            {(data) => (
              <Bars
                rows={AGING.map(([k, label]) => ({
                  label,
                  value: data[k] ?? 0,
                  tone: k === '7+_days' ? 'danger' : undefined,
                }))}
              />
            )}
          </QueryBody>
        </Card>

        {orgScope ? (
          <Card title="Team performance">
            <QueryBody query={team}>
              {(rows) =>
                rows.length === 0 ? (
                  <EmptyState
                    title="No team data"
                    message="Performance appears once members have leads."
                  />
                ) : (
                  <View style={{ gap: 4 }}>
                    {rows.map((r) => (
                      <Text
                        key={r.id}
                        onPress={() => setMember(r)}
                        accessibilityRole="button"
                        style={styles.teamRow}
                      >
                        <Text variant="label">{r.name}</Text>
                        <Text color="muted">{`  ${r.convertedLeads}/${r.totalLeads} · ${r.conversionRate.toFixed(1)}%`}</Text>
                      </Text>
                    ))}
                  </View>
                )
              }
            </QueryBody>
          </Card>
        ) : null}
      </ScrollView>
      {member ? (
        <MemberDetail row={member} days={Number(days)} onClose={() => setMember(null)} />
      ) : null}
    </Screen>
  );
}

function MemberDetail({
  row,
  days,
  onClose,
}: {
  row: SalesPerformanceRow;
  days: number;
  onClose: () => void;
}) {
  const key = useQueryKey();
  const conversion = useQuery({
    queryKey: key('reports', 'conversion', days, 'member', row.id),
    queryFn: () => api().v1.reports.conversion({ days, user_id: row.id }),
  });
  return (
    <Sheet visible onClose={onClose} title={row.name} subtitle={row.email}>
      <Text>
        {row.convertedLeads} of {row.totalLeads} leads converted ({row.conversionRate.toFixed(1)}%)
        in the last {days} days.
      </Text>
      <QueryBody query={conversion}>
        {(data) => (
          <Bars
            rows={(Object.entries(data) as Array<[LeadStatus, number]>).map(([s, n]) => ({
              label: s,
              value: n,
              tone: LEAD_STATUS_TONE[s],
            }))}
          />
        )}
      </QueryBody>
    </Sheet>
  );
}

function QueryBody<T>({
  query,
  children,
}: {
  query: { data: T | undefined; error: unknown; isPending: boolean; refetch: () => unknown };
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending) return <LoadingState />;
  if (query.error || query.data === undefined)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <>{children(query.data)}</>;
}

/** Accessible horizontal bars (each row reads "label: value"). */
function Bars({
  rows,
}: {
  rows: Array<{ label: string; value: number; tone?: string | undefined }>;
}) {
  const c = useColors();
  const max = Math.max(1, ...rows.map((r) => r.value));
  const color = (tone?: string) =>
    tone === 'danger'
      ? c.danger
      : tone === 'success'
        ? c.success
        : tone === 'warning'
          ? c.warning
          : c.primary;
  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      {rows.map((r) => (
        <View key={r.label} accessible accessibilityLabel={`${r.label}: ${r.value}`}>
          <View style={styles.barLabel}>
            <Text variant="caption">{r.label}</Text>
            <Text variant="caption" color="muted">
              {formatNumber(r.value)}
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: c.surfaceMuted }]}>
            <View
              style={[
                styles.bar,
                { width: `${(r.value / max) * 100}%`, backgroundColor: color(r.tone) },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  teamRow: { paddingVertical: 8 },
  barLabel: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 2 },
  bar: { height: 8, borderRadius: 4 },
});
