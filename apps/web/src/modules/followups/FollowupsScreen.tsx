'use client';

import type { FollowupScheduleItem, LeadStatus } from '@crm/types';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DropdownMenu,
  EmptyState,
  Field,
  MoreIcon,
  PageHeader,
  Select,
  Tabs,
  useToast,
} from '@crm/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { useListParams } from '@/hooks/useListParams';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatRelative } from '@/lib/format';
import { LEAD_STATUS_OPTIONS } from '@/lib/labels';
import { useLeadMutations } from '@/modules/leads/hooks';
import { LeadStatusBadge, ScheduleFollowupDialog } from '@/modules/leads/LeadDialogs';
import { useQueryKey, useSession } from '@/providers/SessionProvider';

/**
 * The follow-up schedule: leads with a next call date (own scope: my leads).
 * "Overdue" is derived from the date, never a stored status. Completing a
 * follow-up = logging the outcome on the lead and clearing or moving its next call.
 */
export function FollowupsScreen() {
  const key = useQueryKey();
  const session = useSession();
  const router = useRouter();
  const { params, setParams } = useListParams(['view'] as const);
  const overdue = params.view === 'overdue';
  const schedule = useQuery({
    queryKey: key('followups', { overdue }),
    queryFn: () => api().v1.followups.schedule(overdue ? { overdue: true } : {}),
  });
  const [rescheduling, setRescheduling] = useState<FollowupScheduleItem | null>(null);
  const [logging, setLogging] = useState<FollowupScheduleItem | null>(null);
  const canUpdateLeads = session.can('crm.leads.update');

  const columns: Column<FollowupScheduleItem>[] = [
    {
      id: 'lead',
      header: 'Lead',
      cell: (item) => (
        <div>
          <Link
            href={`/leads/${item.lead_id}`}
            className="font-medium hover:text-primary hover:underline"
          >
            {item.lead_name}
          </Link>
          <p className="text-xs text-muted">{item.lead_mobile}</p>
        </div>
      ),
    },
    {
      id: 'when',
      header: 'Next call',
      cell: (item) => (
        <div>
          <p className={item.overdue ? 'font-medium text-danger' : undefined}>
            {formatRelative(item.next_call_at)}
          </p>
          <p className="text-xs text-muted">{formatDateTime(item.next_call_at)}</p>
        </div>
      ),
    },
    {
      id: 'state',
      header: 'State',
      cell: (item) =>
        item.overdue ? <Badge tone="danger">Overdue</Badge> : <Badge tone="info">Upcoming</Badge>,
    },
    {
      id: 'status',
      header: 'Lead status',
      hideBelow: 'sm',
      cell: (item) => <LeadStatusBadge status={item.lead_status as LeadStatus} />,
    },
    {
      id: 'owner',
      header: 'Assigned to',
      hideBelow: 'md',
      cell: (item) => item.assigned_to_name ?? <span className="text-muted">Unassigned</span>,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-10 text-right',
      cell: (item) => (
        <DropdownMenu
          label={`Actions for ${item.lead_name}`}
          trigger={<MoreIcon />}
          items={[
            { label: 'Open lead', onSelect: () => router.push(`/leads/${item.lead_id}`) },
            ...(session.can('crm.followups.create')
              ? [{ label: 'Reschedule…', onSelect: () => setRescheduling(item) }]
              : []),
            ...(canUpdateLeads
              ? [{ label: 'Log outcome…', onSelect: () => setLogging(item) }]
              : []),
          ]}
        />
      ),
    },
  ];

  const table = (
    <DataTable
      caption={overdue ? 'Overdue follow-ups' : 'Follow-up schedule'}
      columns={columns}
      rows={schedule.data}
      rowKey={(item) => item.lead_id}
      loading={schedule.isPending}
      error={schedule.error}
      onRetry={() => void schedule.refetch()}
      empty={
        <EmptyState
          title={overdue ? 'Nothing overdue' : 'No follow-ups scheduled'}
          description={
            overdue
              ? 'Every scheduled call is on time.'
              : 'Schedule a follow-up from a lead to see it here.'
          }
        />
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description={
          schedule.data ? `${schedule.data.length} ${overdue ? 'overdue' : 'scheduled'}` : undefined
        }
      />
      <Tabs
        label="Follow-up views"
        value={overdue ? 'overdue' : 'all'}
        onChange={(id) => setParams({ view: id === 'overdue' ? 'overdue' : null })}
        tabs={[
          { id: 'all', label: 'All scheduled', content: table },
          { id: 'overdue', label: 'Overdue', content: table },
        ]}
      />
      <ScheduleFollowupDialog
        lead={rescheduling ? { id: rescheduling.lead_id, full_name: rescheduling.lead_name } : null}
        onClose={() => setRescheduling(null)}
      />
      <LogOutcomeDialog item={logging} onClose={() => setLogging(null)} />
    </>
  );
}

/** Records the call outcome on the lead: new status, and the next call is cleared. */
function LogOutcomeDialog({
  item,
  onClose,
}: {
  item: FollowupScheduleItem | null;
  onClose: () => void;
}) {
  const { update } = useLeadMutations();
  const toast = useToast();
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  if (item && item.lead_id !== lastId) {
    setLastId(item.lead_id);
    setStatus(item.lead_status);
    setError(null);
  }

  const submit = async () => {
    if (!item) return;
    try {
      await update.mutateAsync({
        id: item.lead_id,
        input: { status: status as LeadStatus, next_call_at: null },
      });
      toast.success('Follow-up completed', item.lead_name);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title="Log follow-up outcome"
      description={item?.lead_name}
      busy={update.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button variant="primary" loading={update.isPending} onClick={() => void submit()}>
            Complete follow-up
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}
      <p className="mb-3 text-sm text-muted">
        The scheduled call is removed from the list. Schedule another follow-up from the lead if
        needed.
      </p>
      <Field label="Lead status after the call">
        <Select
          value={status}
          options={LEAD_STATUS_OPTIONS}
          onChange={(event) => setStatus(event.target.value)}
        />
      </Field>
    </Dialog>
  );
}
