'use client';

import type { Task, TaskStatus } from '@crm/types';
import {
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  EmptyState,
  MoreIcon,
  PageHeader,
  PlusIcon,
  Select,
  useToast,
} from '@crm/ui';
import { useState } from 'react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { useListParams } from '@/hooks/useListParams';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, isPast } from '@/lib/format';
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_OPTIONS,
  TASK_STATUS_TONE,
} from '@/lib/labels';
import { useSession } from '@/providers/SessionProvider';
import { TaskFormSheet } from './TaskFormSheet';
import { useTaskMutations, useTasks } from './hooks';

const OPEN: TaskStatus[] = ['pending', 'in_progress'];

export function TasksScreen() {
  const session = useSession();
  const toast = useToast();
  const { params, page, setParams } = useListParams(['status'] as const, { sort: 'due_date' });
  const tasks = useTasks({
    page,
    limit: 20,
    sort: params.sort,
    ...(params.status ? { status: params.status as TaskStatus } : {}),
  });
  const { update, remove } = useTaskMutations();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  const mine = (t: Task) => t.assigned_to === session.user?.id;
  const canEdit = (t: Task) =>
    session.canOrg('crm.tasks.update') || (session.can('crm.tasks.update') && mine(t));
  const canDelete = (t: Task) =>
    session.canOrg('crm.tasks.delete') || (session.can('crm.tasks.delete') && mine(t));

  const setStatus = (task: Task, status: TaskStatus) =>
    update.mutate(
      { id: task.id, input: { status } },
      {
        onSuccess: () =>
          toast.success(status === 'completed' ? 'Task completed' : 'Task updated', task.title),
        onError: (error) => toast.error('Could not update task', errorMessage(error)),
      },
    );

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success('Task deleted', deleting.title);
      setDeleting(null);
    } catch (error) {
      toast.error('Could not delete task', errorMessage(error));
    }
  };

  const columns: Column<Task>[] = [
    {
      id: 'done',
      header: <span className="sr-only">Complete</span>,
      className: 'w-8',
      cell: (t) =>
        canEdit(t) ? (
          <input
            type="checkbox"
            aria-label={t.status === 'completed' ? `Reopen ${t.title}` : `Complete ${t.title}`}
            checked={t.status === 'completed'}
            onChange={(event) => setStatus(t, event.target.checked ? 'completed' : 'pending')}
            className="h-4 w-4 accent-[var(--crm-primary)]"
          />
        ) : null,
    },
    {
      id: 'title',
      header: 'Task',
      cell: (t) => (
        <div className="min-w-0">
          <p className={t.status === 'completed' ? 'text-muted line-through' : 'font-medium'}>
            {t.title}
          </p>
          {t.description && <p className="line-clamp-1 text-xs text-muted">{t.description}</p>}
        </div>
      ),
    },
    {
      id: 'due',
      header: 'Due',
      sortField: 'due_date',
      cell: (t) => (
        <span
          className={
            OPEN.includes(t.status) && isPast(t.due_date) ? 'font-medium text-danger' : undefined
          }
        >
          {formatDateTime(t.due_date)}
          {OPEN.includes(t.status) && isPast(t.due_date) && (
            <span className="sr-only"> (overdue)</span>
          )}
        </span>
      ),
    },
    {
      id: 'priority',
      header: 'Priority',
      sortField: 'priority',
      hideBelow: 'sm',
      cell: (t) => (
        <Badge tone={TASK_PRIORITY_TONE[t.priority]}>{TASK_PRIORITY_LABEL[t.priority]}</Badge>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortField: 'status',
      cell: (t) => <Badge tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>,
    },
    {
      id: 'owner',
      header: 'Assigned to',
      hideBelow: 'md',
      cell: (t) => t.assigned_to_name ?? <span className="text-muted">Unassigned</span>,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-10 text-right',
      cell: (t) => {
        const items = [
          ...(canEdit(t) ? [{ label: 'Edit', onSelect: () => setEditing(t) }] : []),
          ...(canEdit(t) && t.status === 'pending'
            ? [{ label: 'Start', onSelect: () => setStatus(t, 'in_progress') }]
            : []),
          ...(canDelete(t)
            ? [{ label: 'Delete…', tone: 'danger' as const, onSelect: () => setDeleting(t) }]
            : []),
        ];
        return items.length ? (
          <DropdownMenu label={`Actions for ${t.title}`} trigger={<MoreIcon />} items={items} />
        ) : null;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Tasks"
        description={tasks.data ? `${tasks.data.pagination.total} tasks` : undefined}
        actions={
          <PermissionGate permission="crm.tasks.create">
            <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
              New task
            </Button>
          </PermissionGate>
        }
      />
      <div className="mb-3">
        <Select
          aria-label="Filter by status"
          className="w-44"
          placeholder="All statuses"
          options={TASK_STATUS_OPTIONS}
          value={params.status}
          onChange={(event) => setParams({ status: event.target.value })}
        />
      </div>
      <DataTable
        caption="Tasks"
        columns={columns}
        rows={tasks.data?.items}
        rowKey={(t) => t.id}
        loading={tasks.isPending}
        error={tasks.error}
        onRetry={() => void tasks.refetch()}
        sort={params.sort}
        onSortChange={(sort) => setParams({ sort })}
        pagination={tasks.data?.pagination}
        onPageChange={(next) => setParams({ page: next })}
        empty={
          <EmptyState
            title={params.status ? 'No tasks with this status' : 'No tasks yet'}
            action={
              session.can('crm.tasks.create') && !params.status ? (
                <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
                  New task
                </Button>
              ) : undefined
            }
          />
        }
      />
      <TaskFormSheet
        open={creating || editing !== null}
        task={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        loading={remove.isPending}
        title="Delete task?"
        confirmLabel="Delete task"
        description={`“${deleting?.title ?? ''}” will be permanently deleted, including from the calendar.`}
      />
    </>
  );
}
