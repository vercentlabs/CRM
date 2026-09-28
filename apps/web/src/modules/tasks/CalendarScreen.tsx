'use client';

import type { CalendarEvent, Task } from '@crm/types';
import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  IconButton,
  PageHeader,
  PlusIcon,
  cn,
} from '@crm/ui';
import { useMemo, useState } from 'react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { ApiErrorState } from '@/components/feedback/QueryState';
import { formatTime } from '@/lib/format';
import { TASK_PRIORITY_TONE } from '@/lib/labels';
import { useSession } from '@/providers/SessionProvider';
import { useCalendarEvents } from './hooks';
import { TaskFormSheet } from './TaskFormSheet';

const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2024, 0, 7 + i)),
);
const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Event → the task shape the shared form edits (calendar events are tasks). */
const eventAsTask = (event: CalendarEvent): Task => ({
  id: event.id,
  title: event.title,
  description: event.description,
  due_date: event.start_date,
  priority: event.priority,
  status: event.status,
  assigned_to: event.user_id,
  created_by: 0,
  created_at: event.start_date,
  updated_at: event.start_date,
  assigned_to_name: event.user_name,
  assigned_to_email: null,
});

const toneDot: Record<string, string> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  neutral: 'bg-muted',
};

/**
 * Month view over `/calendar/events`, which projects tasks (due date = start).
 * Creating or editing an event writes the underlying task.
 */
export function CalendarScreen() {
  const session = useSession();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [editing, setEditing] = useState<Task | null>(null);
  const [creatingOn, setCreatingOn] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - start.getDay());
    return Array.from(
      { length: 42 },
      (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
    );
  }, [month]);

  const range = useMemo(
    () => ({
      from: days[0]!.toISOString(),
      to: new Date(days[41]!.getTime() + 86_400_000).toISOString(),
    }),
    [days],
  );
  const events = useCalendarEvents(range);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events.data ?? []) {
      const key = dayKey(new Date(event.start_date));
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [events.data]);

  const today = dayKey(new Date());
  const canEdit = (event: CalendarEvent) =>
    session.canOrg('crm.tasks.update') ||
    (session.can('crm.tasks.update') && event.user_id === session.user?.id);

  const shift = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Tasks by due date"
        actions={
          <PermissionGate permission="crm.tasks.create">
            <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreatingOn('')}>
              New event
            </Button>
          </PermissionGate>
        }
      />
      <div className="mb-3 flex items-center gap-2">
        <IconButton label="Previous month" variant="secondary" onClick={() => shift(-1)}>
          <ChevronLeftIcon />
        </IconButton>
        <IconButton label="Next month" variant="secondary" onClick={() => shift(1)}>
          <ChevronRightIcon />
        </IconButton>
        <Button
          onClick={() => {
            const now = new Date();
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
          }}
        >
          Today
        </Button>
        <h2 className="ml-2 text-base font-semibold" aria-live="polite">
          {monthLabel.format(month)}
        </h2>
      </div>

      {events.error ? (
        <ApiErrorState error={events.error} onRetry={() => void events.refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table
            className="w-full min-w-[42rem] table-fixed border-collapse text-sm"
            aria-busy={events.isFetching}
          >
            <caption className="sr-only">{monthLabel.format(month)}</caption>
            <thead>
              <tr>
                {WEEKDAYS.map((day) => (
                  <th
                    key={day}
                    scope="col"
                    className="border-b border-border py-2 text-xs font-medium text-muted"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, week) => (
                <tr key={week}>
                  {days.slice(week * 7, week * 7 + 7).map((day) => {
                    const key = dayKey(day);
                    const list = byDay.get(key) ?? [];
                    const inMonth = day.getMonth() === month.getMonth();
                    return (
                      <td
                        key={key}
                        className={cn(
                          'h-28 border border-border p-1 align-top',
                          !inMonth && 'bg-surface-muted/60',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                              key === today && 'bg-primary font-semibold text-primary-fg',
                              !inMonth && 'text-muted',
                            )}
                          >
                            {day.getDate()}
                          </span>
                          {session.can('crm.tasks.create') && (
                            <button
                              type="button"
                              aria-label={`Add event on ${day.toDateString()}`}
                              onClick={() => {
                                const pad = (n: number) => String(n).padStart(2, '0');
                                setCreatingOn(
                                  `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T09:00`,
                                );
                              }}
                              className="rounded px-1 text-xs text-muted opacity-60 hover:bg-surface-muted hover:opacity-100 focus:opacity-100"
                            >
                              +
                            </button>
                          )}
                        </div>
                        <ul className="mt-1 space-y-0.5">
                          {list.slice(0, 3).map((event) => (
                            <li key={event.id}>
                              <button
                                type="button"
                                disabled={!canEdit(event)}
                                onClick={() => setEditing(eventAsTask(event))}
                                className={cn(
                                  'flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-xs hover:bg-surface-muted',
                                  event.status === 'completed' && 'text-muted line-through',
                                )}
                                title={`${event.title}${event.user_name ? ` · ${event.user_name}` : ''}`}
                              >
                                <span
                                  aria-hidden
                                  className={cn(
                                    'h-1.5 w-1.5 shrink-0 rounded-full',
                                    toneDot[TASK_PRIORITY_TONE[event.priority]] ?? 'bg-muted',
                                  )}
                                />
                                <span className="text-muted">{formatTime(event.start_date)}</span>
                                <span className="truncate">{event.title}</span>
                              </button>
                            </li>
                          ))}
                          {list.length > 3 && (
                            <li className="px-1 text-xs text-muted">+{list.length - 3} more</li>
                          )}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TaskFormSheet
        open={editing !== null || creatingOn !== null}
        task={editing}
        defaultDue={creatingOn ?? undefined}
        onClose={() => {
          setEditing(null);
          setCreatingOn(null);
        }}
      />
    </>
  );
}
