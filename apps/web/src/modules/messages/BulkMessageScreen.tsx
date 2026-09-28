'use client';

import type { Lead, LeadStatus, MessageChannel } from '@crm/types';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '@crm/ui';
import { bulkMessageSchema } from '@crm/validation';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { errorMessage } from '@/lib/errors';
import { CHANNEL_LABEL, CHANNEL_OPTIONS, LEAD_STATUS_OPTIONS } from '@/lib/labels';
import { useLeads } from '@/modules/leads/hooks';
import { LeadStatusBadge } from '@/modules/leads/LeadDialogs';
import { useMessageMutations } from './hooks';

const MAX = 500;

/**
 * Sends one message to many leads. The API is all-or-nothing: if any lead is
 * not visible to the sender, nothing is sent.
 */
export function BulkMessageScreen() {
  const toast = useToast();
  const { sendBulk } = useMessageMutations();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search.trim(), 300);
  const leads = useLeads({
    page,
    limit: 25,
    sort: 'full_name',
    ...(debounced ? { search: debounced } : {}),
    ...(status ? { status: status as LeadStatus } : {}),
  });
  const [selected, setSelected] = useState<Map<number, string>>(new Map());
  const [channel, setChannel] = useState<MessageChannel>('sms');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggle = (lead: Lead, on: boolean) =>
    setSelected((current) => {
      const next = new Map(current);
      if (on && next.size < MAX) next.set(lead.id, lead.full_name);
      else next.delete(lead.id);
      return next;
    });

  const pageRows = leads.data?.items ?? [];
  const allOnPage = pageRows.length > 0 && pageRows.every((lead) => selected.has(lead.id));

  const submit = async () => {
    setError(null);
    const parsed = bulkMessageSchema.safeParse({
      lead_ids: [...selected.keys()],
      channel,
      content,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the message');
      return;
    }
    try {
      const result = await sendBulk.mutateAsync(parsed.data);
      toast.success(`${result.count} ${CHANNEL_LABEL[channel]} messages sent`);
      setSelected(new Map());
      setContent('');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const columns: Column<Lead>[] = [
    {
      id: 'select',
      header: (
        <input
          type="checkbox"
          aria-label="Select all leads on this page"
          checked={allOnPage}
          onChange={(event) => pageRows.forEach((lead) => toggle(lead, event.target.checked))}
          className="h-4 w-4 accent-[var(--crm-primary)]"
        />
      ),
      className: 'w-8',
      cell: (lead) => (
        <input
          type="checkbox"
          aria-label={`Select ${lead.full_name}`}
          checked={selected.has(lead.id)}
          onChange={(event) => toggle(lead, event.target.checked)}
          className="h-4 w-4 accent-[var(--crm-primary)]"
        />
      ),
    },
    {
      id: 'name',
      header: 'Lead',
      cell: (lead) => <span className="font-medium">{lead.full_name}</span>,
    },
    { id: 'phone', header: 'Mobile', cell: (lead) => lead.mobile_number },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'sm',
      cell: (lead) => <LeadStatusBadge status={lead.status} />,
    },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted">
        <Link href="/messages" className="hover:text-fg hover:underline">
          Lead messages
        </Link>{' '}
        / <span aria-current="page">Bulk message</span>
      </nav>
      <PageHeader
        title="Bulk message"
        description="Choose leads, then write one message for all of them."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Input
              type="search"
              aria-label="Search leads"
              placeholder="Search leads"
              className="w-full sm:w-64"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              aria-label="Filter by status"
              className="w-40"
              placeholder="All statuses"
              options={LEAD_STATUS_OPTIONS}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <DataTable
            caption="Leads to message"
            columns={columns}
            rows={leads.data?.items}
            rowKey={(lead) => lead.id}
            loading={leads.isPending}
            error={leads.error}
            onRetry={() => void leads.refetch()}
            pagination={leads.data?.pagination}
            onPageChange={setPage}
            selectedKeys={new Set(selected.keys())}
            empty={<EmptyState title="No leads match" />}
          />
        </div>
        <Card title="Message" className="h-fit lg:sticky lg:top-20">
          <div className="space-y-3">
            <p className="text-sm" aria-live="polite">
              <strong>{selected.size}</strong> lead{selected.size === 1 ? '' : 's'} selected
              {selected.size > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-2"
                  onClick={() => setSelected(new Map())}
                >
                  Clear
                </Button>
              )}
            </p>
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label="Channel">
              <Select
                options={CHANNEL_OPTIONS}
                value={channel}
                onChange={(event) => setChannel(event.target.value as MessageChannel)}
              />
            </Field>
            <Field label="Message" required>
              <Textarea
                rows={6}
                maxLength={5000}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </Field>
            <Button
              variant="primary"
              className="w-full"
              loading={sendBulk.isPending}
              disabled={selected.size === 0 || !content.trim()}
              onClick={() => void submit()}
            >
              Send to {selected.size} lead{selected.size === 1 ? '' : 's'}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
