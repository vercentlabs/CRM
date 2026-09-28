'use client';

import type { Call } from '@crm/types';
import { Badge, EmptyState, PageHeader } from '@crm/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { useListParams } from '@/hooks/useListParams';
import { api } from '@/lib/api';
import { formatDateTime, formatDuration } from '@/lib/format';
import { CALL_STATUS_LABEL, CALL_STATUS_TONE } from '@/lib/labels';
import { useQueryKey } from '@/providers/SessionProvider';

/** Call log (own scope: my calls). Calls are started from a lead page. */
export function CallsScreen() {
  const key = useQueryKey();
  const { page, setParams } = useListParams([] as const);
  const calls = useQuery({
    queryKey: key('calls', 'list', page),
    queryFn: () => api().v1.calls.list({ page, limit: 20 }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<Call>[] = [
    {
      id: 'lead',
      header: 'Lead',
      cell: (call) => (
        <Link
          href={`/leads/${call.lead_id}`}
          className="font-medium hover:text-primary hover:underline"
        >
          {call.lead_name}
        </Link>
      ),
    },
    { id: 'started', header: 'Started', cell: (call) => formatDateTime(call.start_time) },
    {
      id: 'duration',
      header: 'Duration',
      className: 'tabular-nums',
      cell: (call) => formatDuration(call.duration_seconds),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (call) => (
        <Badge tone={CALL_STATUS_TONE[call.call_status]}>
          {CALL_STATUS_LABEL[call.call_status]}
        </Badge>
      ),
    },
    { id: 'outcome', header: 'Outcome', hideBelow: 'md', cell: (call) => call.outcome ?? '—' },
    {
      id: 'recording',
      header: 'Recording',
      hideBelow: 'sm',
      cell: (call) =>
        call.recording_url && /^https:\/\//.test(call.recording_url) ? (
          <a
            href={call.recording_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Listen
            <span className="sr-only">
              {' '}
              to the recording of the call with {call.lead_name} (opens in a new tab)
            </span>
          </a>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Calls" description="Start a call from a lead's page." />
      <DataTable
        caption="Call log"
        columns={columns}
        rows={calls.data?.items}
        rowKey={(call) => call.id}
        loading={calls.isPending}
        error={calls.error}
        onRetry={() => void calls.refetch()}
        pagination={calls.data?.pagination}
        onPageChange={(next) => setParams({ page: next })}
        empty={
          <EmptyState
            title="No calls yet"
            description="Calls you place from a lead page are logged here."
          />
        }
      />
    </>
  );
}
