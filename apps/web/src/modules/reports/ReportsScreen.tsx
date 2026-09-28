'use client';

import type { LeadStatus, ReportPeriod } from '@crm/types';
import {
  Button,
  Card,
  DownloadIcon,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  Stat,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tabs,
  useToast,
} from '@crm/ui';
import { LEAD_STATUSES } from '@crm/validation';
import { useState } from 'react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { BarList, ColumnChart } from '@/components/charts/Charts';
import { ApiErrorState } from '@/components/feedback/QueryState';
import { useListParams } from '@/hooks/useListParams';
import { errorMessage } from '@/lib/errors';
import { formatNumber } from '@/lib/format';
import { downloadLeadsCsv } from '@/modules/leads/hooks';
import { useMemberOptions } from '@/modules/organization/hooks';
import { useSession } from '@/providers/SessionProvider';
import { useConversion, useLeadAging, useLeadsOverTime, useSalesPerformance } from './hooks';
import { fillSeries } from './series';

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
];
const ALL_TIME = { value: '', label: 'All time' };
const PERIOD_OPTIONS: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'today', label: 'Today (by hour)' },
  { value: 'week', label: 'This week (by day)' },
  { value: 'month', label: 'This month (by week)' },
];
const AGING_LABELS: Record<string, string> = {
  '0-1_days': '0–1 days',
  '2-3_days': '2–3 days',
  '4-7_days': '4–7 days',
  '7+_days': 'Over 7 days',
};

/**
 * Reports. With own report scope the API returns the viewer's data only;
 * team views (member filter, sales performance) need organization scope.
 */
export function ReportsScreen() {
  const session = useSession();
  const toast = useToast();
  const teamScope = session.canOrg('crm.reports.read');
  const { params, setParams } = useListParams(['tab', 'days', 'member', 'period'] as const);
  const [exporting, setExporting] = useState(false);
  const tab = params.tab || 'conversion';

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadLeadsCsv();
    } catch (error) {
      toast.error('Export failed', errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const tabs = [
    {
      id: 'conversion',
      label: 'Conversion',
      content: (
        <ConversionReport
          days={params.days}
          member={params.member}
          setParams={setParams}
          teamScope={teamScope}
        />
      ),
    },
    { id: 'aging', label: 'Lead aging', content: <AgingReport /> },
    {
      id: 'activity',
      label: 'New leads',
      content: (
        <ActivityReport
          period={(params.period || 'month') as ReportPeriod}
          setPeriod={(period) => setParams({ period })}
        />
      ),
    },
    ...(teamScope
      ? [
          {
            id: 'performance',
            label: 'Team performance',
            content: (
              <PerformanceReport
                days={params.days || '30'}
                member={params.member}
                setParams={setParams}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Reports"
        description={teamScope ? 'Organization-wide' : 'Your leads and activity'}
        actions={
          <PermissionGate permission="crm.reports.export">
            <Button icon={<DownloadIcon />} loading={exporting} onClick={() => void exportCsv()}>
              Export leads CSV
            </Button>
          </PermissionGate>
        }
      />
      <Tabs
        label="Reports"
        value={tabs.some((t) => t.id === tab) ? tab : 'conversion'}
        onChange={(id) => setParams({ tab: id, member: null })}
        tabs={tabs}
      />
    </>
  );
}

type SetParams = (changes: Record<string, string | number | null>) => void;

function MemberFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { can } = useSession();
  const members = useMemberOptions(can('settings.users.read'));
  if (!can('settings.users.read')) return null;
  return (
    <Select
      aria-label="Team member"
      className="w-48"
      placeholder="Whole team"
      options={members.data ?? []}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function ConversionReport({
  days,
  member,
  setParams,
  teamScope,
}: {
  days: string;
  member: string;
  setParams: SetParams;
  teamScope: boolean;
}) {
  const report = useConversion({
    ...(days ? { days: Number(days) } : {}),
    ...(teamScope && member ? { user_id: Number(member) } : {}),
  });
  const counts = LEAD_STATUSES.map((status) => ({
    label: status,
    value: report.data?.[status as LeadStatus] ?? 0,
  }));
  const total = counts.reduce((sum, d) => sum + d.value, 0);
  const converted = report.data?.Converted ?? 0;
  const lost = report.data?.Lost ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select
          aria-label="Date range"
          className="w-44"
          options={[ALL_TIME, ...RANGE_OPTIONS]}
          value={days}
          onChange={(event) => setParams({ days: event.target.value })}
        />
        {teamScope && (
          <MemberFilter value={member} onChange={(value) => setParams({ member: value })} />
        )}
      </div>
      {report.error ? (
        <ApiErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : report.isPending ? (
        <Skeleton className="h-48" />
      ) : total === 0 ? (
        <EmptyState title="No leads in this range" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Leads" value={formatNumber(total)} />
            <Stat
              label="Conversion rate"
              value={`${((converted / total) * 100).toFixed(1)}%`}
              hint={`${converted} converted`}
            />
            <Stat
              label="Lost"
              value={formatNumber(lost)}
              hint={`${((lost / total) * 100).toFixed(1)}% of leads`}
            />
          </div>
          <Card title="Leads by status">
            <BarList data={counts} caption="Leads by status" valueLabel="Leads" />
          </Card>
        </>
      )}
    </div>
  );
}

function AgingReport() {
  const report = useLeadAging();
  if (report.error)
    return <ApiErrorState error={report.error} onRetry={() => void report.refetch()} />;
  if (report.isPending) return <Skeleton className="h-48" />;
  const data = Object.entries(AGING_LABELS).map(([key, label]) => ({
    label,
    value: report.data[key as keyof typeof report.data] ?? 0,
  }));
  return (
    <Card title="Leads by age since creation">
      <BarList data={data} caption="Leads by age since creation" valueLabel="Leads" />
    </Card>
  );
}

function ActivityReport({
  period,
  setPeriod,
}: {
  period: ReportPeriod;
  setPeriod: (period: string) => void;
}) {
  const report = useLeadsOverTime(period);
  return (
    <div className="space-y-3">
      <Select
        aria-label="Period"
        className="w-52"
        options={PERIOD_OPTIONS}
        value={period}
        onChange={(event) => setPeriod(event.target.value)}
      />
      {report.error ? (
        <ApiErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : report.isPending ? (
        <Skeleton className="h-48" />
      ) : (
        <Card title="New leads">
          <ColumnChart data={fillSeries(period, report.data)} caption="New leads over time" />
        </Card>
      )}
    </div>
  );
}

function PerformanceReport({
  days,
  member,
  setParams,
}: {
  days: string;
  member: string;
  setParams: SetParams;
}) {
  const report = useSalesPerformance({
    days: Number(days),
    ...(member ? { user_id: Number(member) } : {}),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select
          aria-label="Date range"
          className="w-44"
          options={RANGE_OPTIONS}
          value={days}
          onChange={(event) => setParams({ days: event.target.value })}
        />
        <MemberFilter value={member} onChange={(value) => setParams({ member: value })} />
      </div>
      {report.error ? (
        <ApiErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : report.isPending ? (
        <Skeleton className="h-48" />
      ) : report.data.length === 0 ? (
        <EmptyState
          title="No team members to report on"
          description="Performance covers active non-admin members."
        />
      ) : (
        <>
          <Table caption="Team performance">
            <THead>
              <tr>
                <Th>Member</Th>
                <Th className="text-right">Leads</Th>
                <Th className="text-right">Converted</Th>
                <Th className="text-right">Conversion rate</Th>
              </tr>
            </THead>
            <TBody>
              {report.data.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => setParams({ member: String(row.id) })}
                    >
                      {row.name}
                    </button>
                    <span className="block text-xs text-muted">{row.email}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{formatNumber(row.totalLeads)}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(row.convertedLeads)}</Td>
                  <Td className="text-right tabular-nums">{row.conversionRate.toFixed(1)}%</Td>
                </tr>
              ))}
            </TBody>
          </Table>
          {report.data.length > 1 && (
            <Card title="Leads per member">
              <BarList
                data={report.data.map((row) => ({
                  label: row.name,
                  value: row.totalLeads,
                  detail: `${row.convertedLeads} converted`,
                }))}
                caption="Leads per member"
                valueLabel="Leads"
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
