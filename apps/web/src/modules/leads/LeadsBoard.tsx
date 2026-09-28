'use client';

import type { Lead, LeadStatus } from '@crm/types';
import { Avatar, Select, cn } from '@crm/ui';
import { LEAD_STATUSES } from '@crm/validation';
import Link from 'next/link';
import { useState } from 'react';
import { formatRelative } from '@/lib/format';
import { LEAD_STATUS_OPTIONS } from '@/lib/labels';

/**
 * Board view of the current page of leads, one column per status. Cards move
 * by drag and drop or, for keyboard and touch users, with the status select.
 * Status changes go through the same API update as the edit form.
 */
export function LeadsBoard({
  leads,
  canChangeStatus,
  onStatusChange,
}: {
  leads: Lead[];
  canChangeStatus: (lead: Lead) => boolean;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
}) {
  const [dragging, setDragging] = useState<Lead | null>(null);
  const [over, setOver] = useState<LeadStatus | null>(null);

  return (
    <div className="grid auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
      {LEAD_STATUSES.map((status) => {
        const column = leads.filter((lead) => lead.status === status);
        return (
          <section
            key={status}
            aria-label={`${status} (${column.length})`}
            onDragOver={(event) => {
              if (dragging && dragging.status !== status) {
                event.preventDefault();
                setOver(status);
              }
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(null);
              if (dragging && dragging.status !== status) onStatusChange(dragging, status);
              setDragging(null);
            }}
            className={cn(
              'flex min-h-40 flex-col rounded-lg border border-border bg-surface-muted/60 p-2',
              over === status && 'border-primary bg-primary-soft/40',
            )}
          >
            <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-muted uppercase">
              {status}
              <span className="rounded bg-surface px-1.5 py-0.5 text-[11px]">{column.length}</span>
            </h3>
            <ul className="space-y-2">
              {column.map((lead) => {
                const movable = canChangeStatus(lead);
                return (
                  <li
                    key={lead.id}
                    draggable={movable}
                    onDragStart={() => setDragging(lead)}
                    onDragEnd={() => setDragging(null)}
                    className="rounded-md border border-border bg-surface p-2.5 text-sm shadow-sm"
                  >
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {lead.full_name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">{lead.mobile_number}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                        <Avatar name={lead.assigned_user_name} size="sm" decorative />
                        <span className="truncate">{lead.assigned_user_name ?? 'Unassigned'}</span>
                      </span>
                      {lead.next_call_at && (
                        <span className="shrink-0 text-xs text-muted">
                          {formatRelative(lead.next_call_at)}
                        </span>
                      )}
                    </div>
                    {movable && (
                      <Select
                        aria-label={`Status of ${lead.full_name}`}
                        className="mt-2 h-8 text-xs"
                        value={lead.status}
                        options={LEAD_STATUS_OPTIONS}
                        onChange={(event) => onStatusChange(lead, event.target.value as LeadStatus)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
