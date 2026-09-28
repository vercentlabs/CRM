'use client';

import type { ReportPeriod } from '@crm/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  RefreshIcon,
  Select,
  Skeleton,
  Stat,
  useToast,
} from '@crm/ui';
import { LEAD_STATUSES } from '@crm/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BarList, ColumnChart } from '@/components/charts/Charts';
import { ApiErrorState } from '@/components/feedback/QueryState';
import { api } from '@/lib/api';
import { errorMessage, isStatus } from '@/lib/errors';
import { formatDateTime, formatNumber, formatRelative, isPast } from '@/lib/format';
import { TASK_PRIORITY_LABEL, TASK_PRIORITY_TONE } from '@/lib/labels';
import { useLeads } from '@/modules/leads/hooks';
import { LeadStatusBadge } from '@/modules/leads/LeadDialogs';
import {
  useDashboardSummary,
  useLeadsOverTime,
  useSalesPerformance,
} from '@/modules/reports/hooks';
import { fillSeries } from '@/modules/reports/series';
import { useTasks } from '@/modules/tasks/hooks';
import { useQueryKey, useSession } from '@/providers/SessionProvider';

const PERIODS: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

/**
 * Operational home: what needs attention now (overdue follow-ups, tasks due),
 * then the numbers. Every figure comes from the API; sections the viewer has
 * no permission for are simply not shown.
 */
export function DashboardScreen() {
  const { user, organization, can, canOrg } = useSession();
  return (
    <>
      <PageHeader
        title={`Hello, ${user?.name?.split(' ')[0] ?? 'there'}`}
        description={organization?.name}
      />
      <div className="space-y-4">
        {can('crm.reports.read') && <SummaryStats />}
        <div className="grid gap-4 xl:grid-cols-3">
          {can('crm.followups.read') && <OverdueFollowups />}
          {can('crm.tasks.read') && <TasksDue />}
          {can('crm.leads.read') && <RecentLeads />}
        </div>
        {can('crm.reports.read') && (
          <div className="grid gap-4 lg:grid-cols-2">
            <StatusBreakdown />
            <NewLeadsChart />
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {canOrg('crm.reports.read') && <TeamSnapshot />}
          <GoldRate />
        </div>
      </div>
    </>
  );
}

function SummaryStats() {
  const summary = useDashboardSummary();
  if (summary.error)
    return <ApiErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  const d = summary.data;
  const loading = <Skeleton className="h-7 w-16" />;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Stat label="Leads" value={d ? formatNumber(d.totalLeads) : loading} />
      <Stat label="Pending follow-ups" value={d ? formatNumber(d.pendingFollowups) : loading} />
      <Stat
        label="Overdue follow-ups"
        value={d ? formatNumber(d.overdueFollowups) : loading}
        tone={d && d.overdueFollowups > 0 ? 'danger' : 'default'}
      />
      <Stat label="Calls today" value={d ? formatNumber(d.callsToday) : loading} />
      <Stat label="Messages today" value={d ? formatNumber(d.messagesToday) : loading} />
    </div>
  );
}

function OverdueFollowups() {
  const key = useQueryKey();
  const overdue = useQuery({
    queryKey: key('followups', { overdue: true }),
    queryFn: () => api().v1.followups.schedule({ overdue: true }),
  });
  return (
    <Card
      title="Overdue follow-ups"
      actions={
        <Link href="/followups?view=overdue" className="text-xs text-primary hover:underline">
          View all
        </Link>
      }
    >
      {overdue.isPending ? (
        <Skeleton className="h-24" />
      ) : overdue.error ? (
        <ApiErrorState error={overdue.error} />
      ) : overdue.data.length === 0 ? (
        <p className="text-sm text-muted">Nothing overdue. 🎉</p>
      ) : (
        <ul className="divide-y divide-border">
          {overdue.data.slice(0, 6).map((item) => (
            <li key={item.lead_id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <Link
                href={`/leads/${item.lead_id}`}
                className="truncate font-medium hover:underline"
              >
                {item.lead_name}
              </Link>
              <span className="shrink-0 text-xs font-medium text-danger">
                {formatRelative(item.next_call_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TasksDue() {
  const endOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, []);
  const tasks = useTasks({
    page: 1,
    limit: 8,
    sort: 'due_date',
    status: 'pending',
    due_to: endOfToday,
  });
  return (
    <Card
      title="Tasks due today"
      actions={
        <Link href="/tasks" className="text-xs text-primary hover:underline">
          View all
        </Link>
      }
    >
      {tasks.isPending ? (
        <Skeleton className="h-24" />
      ) : tasks.error ? (
        <ApiErrorState error={tasks.error} />
      ) : tasks.data.items.length === 0 ? (
        <p className="text-sm text-muted">No open tasks due today.</p>
      ) : (
        <ul className="divide-y divide-border">
          {tasks.data.items.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{task.title}</span>
                <span
                  className={isPast(task.due_date) ? 'text-xs text-danger' : 'text-xs text-muted'}
                >
                  {isPast(task.due_date) ? 'Overdue · ' : ''}
                  {formatDateTime(task.due_date)}
                </span>
              </span>
              <Badge tone={TASK_PRIORITY_TONE[task.priority]}>
                {TASK_PRIORITY_LABEL[task.priority]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentLeads() {
  const leads = useLeads({ page: 1, limit: 6, sort: '-created_at' });
  return (
    <Card
      title="Recent leads"
      actions={
        <Link href="/leads" className="text-xs text-primary hover:underline">
          View all
        </Link>
      }
    >
      {leads.isPending ? (
        <Skeleton className="h-24" />
      ) : leads.error ? (
        <ApiErrorState error={leads.error} />
      ) : leads.data.items.length === 0 ? (
        <EmptyState title="No leads yet" className="py-6" />
      ) : (
        <ul className="divide-y divide-border">
          {leads.data.items.map((lead) => (
            <li key={lead.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <Link
                  href={`/leads/${lead.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {lead.full_name}
                </Link>
                <span className="text-xs text-muted">{formatRelative(lead.created_at)}</span>
              </span>
              <LeadStatusBadge status={lead.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StatusBreakdown() {
  const summary = useDashboardSummary();
  const data = LEAD_STATUSES.map((status) => ({
    label: status,
    value: summary.data?.leadsByStatus.find((row) => row.status === status)?.count ?? 0,
  }));
  return (
    <Card title="Leads by status">
      {summary.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <BarList data={data} caption="Leads by status" valueLabel="Leads" />
      )}
    </Card>
  );
}

function NewLeadsChart() {
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const series = useLeadsOverTime(period);
  return (
    <Card
      title="New leads"
      actions={
        <Select
          aria-label="Period"
          className="h-8 w-32 text-xs"
          options={PERIODS}
          value={period}
          onChange={(event) => setPeriod(event.target.value as ReportPeriod)}
        />
      }
    >
      {series.isPending ? (
        <Skeleton className="h-40" />
      ) : series.error ? (
        <ApiErrorState error={series.error} />
      ) : (
        <ColumnChart
          data={fillSeries(period, series.data)}
          caption={`New leads, ${PERIODS.find((p) => p.value === period)?.label.toLowerCase()}`}
        />
      )}
    </Card>
  );
}

function TeamSnapshot() {
  const performance = useSalesPerformance({ days: 30 });
  return (
    <Card
      title="Team, last 30 days"
      actions={
        <Link href="/reports?tab=performance" className="text-xs text-primary hover:underline">
          Details
        </Link>
      }
    >
      {performance.isPending ? (
        <Skeleton className="h-32" />
      ) : performance.error ? (
        <ApiErrorState error={performance.error} />
      ) : performance.data.length === 0 ? (
        <p className="text-sm text-muted">No team members to report on.</p>
      ) : (
        <BarList
          data={performance.data.map((row) => ({
            label: row.name,
            value: row.totalLeads,
            detail: `${row.convertedLeads} converted (${row.conversionRate}%)`,
          }))}
          caption="Leads per team member, last 30 days"
          valueLabel="Leads"
        />
      )}
    </Card>
  );
}

function GoldRate() {
  const key = useQueryKey();
  const { can } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const rate = useQuery({
    queryKey: key('market', 'gold'),
    queryFn: () => api().v1.market.goldRate(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: () => api().v1.market.refreshGoldRate(),
    onSuccess: (data) => queryClient.setQueryData(key('market', 'gold'), data),
    onError: (error) => toast.error('Could not refresh the gold rate', errorMessage(error)),
  });
  return (
    <Card
      title="Gold rate"
      actions={
        can('settings.organization.manage') ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshIcon />}
            loading={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            Refresh
          </Button>
        ) : undefined
      }
    >
      {rate.isPending ? (
        <Skeleton className="h-20" />
      ) : rate.error ? (
        isStatus(rate.error, 503) ? (
          <p className="text-sm text-muted">The gold rate service is not available right now.</p>
        ) : (
          <ApiErrorState error={rate.error} />
        )
      ) : (
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="22K per gram" value={formatNumber(rate.data.gold_22k['1g'])} />
            <Stat label="24K per gram" value={formatNumber(rate.data.gold_24k['1g'])} />
          </div>
          <p className="text-xs text-muted">
            Updated {formatRelative(rate.data.updated_at)}
            {rate.data.source === 'cache' && ' (cached)'}
            {rate.data.warning && ` · ${rate.data.warning}`}
          </p>
        </div>
      )}
    </Card>
  );
}
