'use client';

import type { Opportunity, OpportunityStage } from '@crm/types';
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
  PlusIcon,
  Select,
  useToast,
} from '@crm/ui';
import Link from 'next/link';
import { useState } from 'react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { MemberSelect } from '@/components/forms/pickers';
import { useListParams } from '@/hooks/useListParams';
import { errorMessage } from '@/lib/errors';
import { formatAmount, formatDate } from '@/lib/format';
import { STAGE_OPTIONS, STAGE_TONE } from '@/lib/labels';
import { useSession } from '@/providers/SessionProvider';
import { useOpportunities, useOpportunity, useOpportunityMutations } from './hooks';
import { OpportunityFormSheet } from './OpportunityFormSheet';

export function OpportunitiesScreen() {
  const session = useSession();
  const toast = useToast();
  const { params, page, setParams } = useListParams(['stage', 'open'] as const, {
    sort: '-created_at',
  });
  const opportunities = useOpportunities({
    page,
    limit: 20,
    sort: params.sort,
    ...(params.stage ? { stage: params.stage as OpportunityStage } : {}),
  });
  const { update } = useOpportunityMutations();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [assigning, setAssigning] = useState<Opportunity | null>(null);

  // Deep link from lead pages: ?open=<id> opens that opportunity for editing.
  const openId = Number(params.open);
  const deepLinked = useOpportunity(openId > 0 ? openId : null).data;

  const isOwn = (o: Opportunity) =>
    o.assigned_to === session.user?.id ||
    (o.assigned_to === null && o.created_by === session.user?.id);
  const canEdit = (o: Opportunity) =>
    session.canOrg('crm.opportunities.update') ||
    (session.can('crm.opportunities.update') && isOwn(o));

  const changeStage = (o: Opportunity, stage: OpportunityStage) =>
    update.mutate(
      { id: o.id, input: { stage } },
      {
        onSuccess: () => toast.success('Stage updated', `${o.title} → ${stage}`),
        onError: (error) => toast.error('Could not update stage', errorMessage(error)),
      },
    );

  const columns: Column<Opportunity>[] = [
    {
      id: 'title',
      header: 'Opportunity',
      cell: (o) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => (canEdit(o) ? setEditing(o) : undefined)}
            className="text-left font-medium hover:text-primary hover:underline disabled:no-underline"
            disabled={!canEdit(o)}
          >
            {o.title}
          </button>
          {o.lead_name && (
            <p className="text-xs text-muted">
              Lead:{' '}
              <Link href={`/leads/${o.lead_id}`} className="hover:underline">
                {o.lead_name}
              </Link>
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'stage',
      header: 'Stage',
      sortField: 'stage',
      cell: (o) =>
        canEdit(o) ? (
          <Select
            aria-label={`Stage of ${o.title}`}
            className="h-8 w-44 text-xs"
            value={o.stage}
            options={STAGE_OPTIONS}
            onChange={(event) => changeStage(o, event.target.value as OpportunityStage)}
          />
        ) : (
          <Badge tone={STAGE_TONE[o.stage]}>{o.stage}</Badge>
        ),
    },
    {
      id: 'value',
      header: 'Value',
      sortField: 'value',
      className: 'text-right tabular-nums',
      cell: (o) => formatAmount(o.value),
    },
    {
      id: 'probability',
      header: 'Probability',
      hideBelow: 'md',
      className: 'text-right tabular-nums',
      cell: (o) => (o.probability === null ? '—' : `${o.probability}%`),
    },
    {
      id: 'close',
      header: 'Expected close',
      sortField: 'expected_close_date',
      hideBelow: 'md',
      cell: (o) => formatDate(o.expected_close_date),
    },
    {
      id: 'owner',
      header: 'Assigned to',
      hideBelow: 'sm',
      cell: (o) => o.assigned_to_name ?? <span className="text-muted">Unassigned</span>,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-10 text-right',
      cell: (o) => {
        const items = [
          ...(canEdit(o) ? [{ label: 'Edit', onSelect: () => setEditing(o) }] : []),
          ...(session.canOrg('crm.opportunities.assign')
            ? [{ label: 'Assign…', onSelect: () => setAssigning(o) }]
            : []),
        ];
        return items.length ? (
          <DropdownMenu label={`Actions for ${o.title}`} trigger={<MoreIcon />} items={items} />
        ) : null;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Opportunities"
        description={
          opportunities.data ? `${opportunities.data.pagination.total} opportunities` : undefined
        }
        actions={
          <PermissionGate permission="crm.opportunities.create">
            <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
              New opportunity
            </Button>
          </PermissionGate>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Select
          aria-label="Filter by stage"
          className="w-52"
          placeholder="All stages"
          options={STAGE_OPTIONS}
          value={params.stage}
          onChange={(event) => setParams({ stage: event.target.value })}
        />
      </div>
      <DataTable
        caption="Opportunities"
        columns={columns}
        rows={opportunities.data?.items}
        rowKey={(o) => o.id}
        loading={opportunities.isPending}
        error={opportunities.error}
        onRetry={() => void opportunities.refetch()}
        sort={params.sort}
        onSortChange={(sort) => setParams({ sort })}
        pagination={opportunities.data?.pagination}
        onPageChange={(next) => setParams({ page: next })}
        empty={
          <EmptyState
            title={params.stage ? `No opportunities in ${params.stage}` : 'No opportunities yet'}
            description="Opportunities are created from a lead."
            action={
              session.can('crm.opportunities.create') && !params.stage ? (
                <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
                  New opportunity
                </Button>
              ) : undefined
            }
          />
        }
      />
      <OpportunityFormSheet
        open={creating || editing !== null || deepLinked !== undefined}
        opportunity={editing ?? deepLinked ?? null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
          if (params.open) setParams({ open: null });
        }}
      />
      <AssignOpportunityDialog opportunity={assigning} onClose={() => setAssigning(null)} />
    </>
  );
}

function AssignOpportunityDialog({
  opportunity,
  onClose,
}: {
  opportunity: Opportunity | null;
  onClose: () => void;
}) {
  const { assign } = useOpportunityMutations();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  if (opportunity && opportunity.id !== lastId) {
    setLastId(opportunity.id);
    setValue(opportunity.assigned_to === null ? '' : String(opportunity.assigned_to));
    setError(null);
  }
  const submit = async () => {
    if (!opportunity) return;
    try {
      await assign.mutateAsync({
        id: opportunity.id,
        input: { assigned_to: value ? Number(value) : null },
      });
      toast.success('Opportunity assigned');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Dialog
      open={opportunity !== null}
      onClose={onClose}
      title="Assign opportunity"
      description={opportunity?.title}
      busy={assign.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={assign.isPending}>
            Cancel
          </Button>
          <Button variant="primary" loading={assign.isPending} onClick={() => void submit()}>
            Assign
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}
      <Field label="Assigned to">
        <MemberSelect value={value} onChange={(event) => setValue(event.target.value)} />
      </Field>
    </Dialog>
  );
}
