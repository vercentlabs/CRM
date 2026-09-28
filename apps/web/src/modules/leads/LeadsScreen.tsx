'use client';

import type { Lead, LeadStatus } from '@crm/types';
import {
  Button,
  DownloadIcon,
  DropdownMenu,
  EmptyState,
  IconButton,
  Input,
  KanbanIcon,
  ListIcon,
  MoreIcon,
  PageHeader,
  PlusIcon,
  Select,
  useToast,
} from '@crm/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useListParams } from '@/hooks/useListParams';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatRelative, isPast } from '@/lib/format';
import { LEAD_STATUS_OPTIONS, leadSourceLabel } from '@/lib/labels';
import { useMemberOptions } from '@/modules/organization/hooks';
import { useSession } from '@/providers/SessionProvider';
import { downloadLeadsCsv, useLeadMutations, useLeads } from './hooks';
import { AssignLeadDialog, LeadStatusBadge, ScheduleFollowupDialog } from './LeadDialogs';
import { LeadFormSheet } from './LeadFormSheet';
import { LeadsBoard } from './LeadsBoard';

const PAGE_SIZE = 20;
const BOARD_PAGE_SIZE = 100;

export function LeadsScreen() {
  const session = useSession();
  const router = useRouter();
  const toast = useToast();
  const { params, page, setParams } = useListParams(
    ['search', 'status', 'assigned_to', 'view'] as const,
    {
      sort: '-created_at',
    },
  );
  const board = params.view === 'board';
  const [searchText, setSearchText] = useState(params.search);
  const debouncedSearch = useDebouncedValue(searchText, 350);

  useEffect(() => {
    if (debouncedSearch !== params.search) setParams({ search: debouncedSearch });
  }, [debouncedSearch, params.search, setParams]);

  const canFilterAssignee = session.canOrg('crm.leads.read') && session.can('settings.users.read');
  const members = useMemberOptions(canFilterAssignee);

  const leads = useLeads({
    page: board ? 1 : page,
    limit: board ? BOARD_PAGE_SIZE : PAGE_SIZE,
    sort: params.sort,
    ...(params.search ? { search: params.search } : {}),
    ...(params.status ? { status: params.status as LeadStatus } : {}),
    ...(params.assigned_to ? { assigned_to: Number(params.assigned_to) } : {}),
  });

  const { update } = useLeadMutations();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [assigning, setAssigning] = useState<Lead | null>(null);
  const [scheduling, setScheduling] = useState<Lead | null>(null);
  const [exporting, setExporting] = useState(false);

  // Ownership rules live in the API; this only hides actions that would be refused.
  const canEdit = (lead: Lead) =>
    session.canOrg('crm.leads.update') ||
    (session.can('crm.leads.update') &&
      (lead.assigned_to === session.user?.id ||
        (lead.assigned_to === null && lead.created_by === session.user?.id)));
  const canAssign = session.canOrg('crm.leads.assign');

  const changeStatus = (lead: Lead, status: LeadStatus) => {
    update.mutate(
      { id: lead.id, input: { status } },
      {
        onSuccess: () => toast.success('Status updated', `${lead.full_name} → ${status}`),
        onError: (error) => toast.error('Could not update status', errorMessage(error)),
      },
    );
  };

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

  const filtered = Boolean(params.search || params.status || params.assigned_to);

  const columns: Column<Lead>[] = [
    {
      id: 'name',
      header: 'Name',
      sortField: 'full_name',
      cell: (lead) => (
        <div className="min-w-0">
          <Link
            href={`/leads/${lead.id}`}
            className="font-medium hover:text-primary hover:underline"
          >
            {lead.full_name}
          </Link>
          <p className="text-xs text-muted">{lead.email ?? lead.mobile_number}</p>
        </div>
      ),
    },
    { id: 'phone', header: 'Mobile', cell: (lead) => lead.mobile_number, hideBelow: 'md' },
    {
      id: 'status',
      header: 'Status',
      sortField: 'status',
      cell: (lead) => <LeadStatusBadge status={lead.status} />,
    },
    {
      id: 'assignee',
      header: 'Assigned to',
      cell: (lead) => lead.assigned_user_name ?? <span className="text-muted">Unassigned</span>,
      hideBelow: 'sm',
    },
    {
      id: 'source',
      header: 'Source',
      cell: (lead) => leadSourceLabel(lead.source) ?? '—',
      hideBelow: 'lg',
    },
    {
      id: 'next_call',
      header: 'Next call',
      sortField: 'next_call_at',
      hideBelow: 'md',
      cell: (lead) =>
        lead.next_call_at ? (
          <span className={isPast(lead.next_call_at) ? 'font-medium text-danger' : undefined}>
            {formatRelative(lead.next_call_at)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      id: 'created',
      header: 'Created',
      sortField: 'created_at',
      cell: (lead) => formatDate(lead.created_at),
      hideBelow: 'lg',
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-10 text-right',
      cell: (lead) => (
        <DropdownMenu
          label={`Actions for ${lead.full_name}`}
          trigger={<MoreIcon />}
          items={[
            { label: 'Open', onSelect: () => router.push(`/leads/${lead.id}`) },
            ...(canEdit(lead) ? [{ label: 'Edit', onSelect: () => setEditing(lead) }] : []),
            ...(canAssign ? [{ label: 'Assign…', onSelect: () => setAssigning(lead) }] : []),
            ...(session.can('crm.followups.create') && canEdit(lead)
              ? [{ label: 'Schedule follow-up…', onSelect: () => setScheduling(lead) }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Leads"
        description={leads.data ? `${leads.data.pagination.total} leads` : undefined}
        actions={
          <>
            <PermissionGate permission="crm.reports.export">
              <Button icon={<DownloadIcon />} onClick={() => void exportCsv()} loading={exporting}>
                Export CSV
              </Button>
            </PermissionGate>
            <PermissionGate permission="crm.leads.create">
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
                New lead
              </Button>
            </PermissionGate>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Input
          type="search"
          aria-label="Search leads"
          placeholder="Search name, email or phone"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          className="w-full sm:w-72"
        />
        <Select
          aria-label="Filter by status"
          className="w-40"
          placeholder="All statuses"
          options={LEAD_STATUS_OPTIONS}
          value={params.status}
          onChange={(event) => setParams({ status: event.target.value })}
        />
        {canFilterAssignee && (
          <Select
            aria-label="Filter by assignee"
            className="w-48"
            placeholder="Anyone"
            options={members.data ?? []}
            value={params.assigned_to}
            onChange={(event) => setParams({ assigned_to: event.target.value })}
          />
        )}
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchText('');
              setParams({ search: null, status: null, assigned_to: null });
            }}
          >
            Clear filters
          </Button>
        )}
        <div
          className="ml-auto flex rounded-md border border-border"
          role="group"
          aria-label="View"
        >
          <IconButton
            label="Table view"
            aria-pressed={!board}
            className={!board ? 'bg-surface-muted' : undefined}
            onClick={() => setParams({ view: null })}
          >
            <ListIcon />
          </IconButton>
          <IconButton
            label="Board view"
            aria-pressed={board}
            className={board ? 'bg-surface-muted' : undefined}
            onClick={() => setParams({ view: 'board' })}
          >
            <KanbanIcon />
          </IconButton>
        </div>
      </div>

      {board && leads.data && !leads.error ? (
        <>
          {leads.data.pagination.total > BOARD_PAGE_SIZE && (
            <p className="mb-2 text-xs text-muted">
              Showing the {BOARD_PAGE_SIZE} most recent matching leads. Use filters or the table
              view for the rest.
            </p>
          )}
          <LeadsBoard
            leads={leads.data.items}
            canChangeStatus={canEdit}
            onStatusChange={changeStatus}
          />
        </>
      ) : (
        <DataTable
          caption="Leads"
          columns={columns}
          rows={leads.data?.items}
          rowKey={(lead) => lead.id}
          loading={leads.isPending}
          error={leads.error}
          onRetry={() => void leads.refetch()}
          sort={params.sort}
          onSortChange={(sort) => setParams({ sort })}
          pagination={leads.data?.pagination}
          onPageChange={(next) => setParams({ page: next })}
          empty={
            <EmptyState
              title={filtered ? 'No leads match these filters' : 'No leads yet'}
              description={
                filtered
                  ? 'Try a different search or clear the filters.'
                  : 'Leads you create or are assigned will appear here.'
              }
              action={
                !filtered && session.can('crm.leads.create') ? (
                  <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
                    New lead
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      <LeadFormSheet
        open={creating || editing !== null}
        lead={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={(lead) => {
          if (creating) router.push(`/leads/${lead.id}`);
        }}
      />
      <AssignLeadDialog lead={assigning} onClose={() => setAssigning(null)} />
      <ScheduleFollowupDialog lead={scheduling} onClose={() => setScheduling(null)} />
    </>
  );
}
