'use client';

import type { AuditLogEntry } from '@crm/types';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
  useToast,
} from '@crm/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { ApiErrorState } from '@/components/feedback/QueryState';
import { useListParams } from '@/hooks/useListParams';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, toIsoOrNull } from '@/lib/format';
import { humanizeCode } from '@/lib/labels';
import { useMemberOptions } from '@/modules/organization/hooks';
import { useQueryKey, useSession } from '@/providers/SessionProvider';
import { WebhooksSettings } from './WebhooksSettings';

export function SettingsScreen() {
  const { can } = useSession();
  const { params, setParams } = useListParams(['tab'] as const);
  const tabs = [
    ...(can('settings.organization.manage')
      ? [
          { id: 'organization', label: 'Organization', content: <OrganizationSettings /> },
          { id: 'email', label: 'Email delivery', content: <EmailCheck /> },
        ]
      : []),
    ...(can('settings.integrations.manage')
      ? [{ id: 'webhooks', label: 'Webhooks', content: <WebhooksSettings /> }]
      : []),
    ...(can('settings.audit.read')
      ? [{ id: 'audit', label: 'Audit log', content: <AuditLog /> }]
      : []),
  ];
  const current = tabs.find((t) => t.id === params.tab)?.id ?? tabs[0]?.id ?? 'organization';
  return (
    <>
      <PageHeader
        title="Settings"
        description={
          <>
            Organization-wide settings. Personal preferences are in{' '}
            <Link href="/account" className="text-primary hover:underline">
              My account
            </Link>
            .
          </>
        }
      />
      <Tabs
        label="Settings sections"
        value={current}
        onChange={(id) => setParams({ tab: id })}
        tabs={tabs}
      />
    </>
  );
}

/** Settings values are stored JSON-encoded; older rows may be raw strings. */
const decode = (value: string | undefined): string => {
  if (value === undefined) return '';
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'string' || typeof parsed === 'number' ? String(parsed) : value;
  } catch {
    return value;
  }
};

const FIELDS = [
  { key: 'site_name', label: 'Display name', hint: 'Shown in emails and exports.' },
  { key: 'timezone', label: 'Time zone', hint: 'IANA name, e.g. Asia/Kolkata.' },
  {
    key: 'date_format',
    label: 'Date format',
    options: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].map((v) => ({ value: v, label: v })),
  },
  {
    key: 'time_format',
    label: 'Time format',
    options: [
      { value: '12h', label: '12-hour' },
      { value: '24h', label: '24-hour' },
    ],
  },
  {
    key: 'items_per_page',
    label: 'Default rows per page',
    options: ['10', '20', '50', '100'].map((v) => ({ value: v, label: v })),
  },
] as const;

/**
 * Tenant preferences only. Server configuration (secrets, SMTP credentials,
 * deployment) is never editable from the web app.
 */
function OrganizationSettings() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const toast = useToast();
  const settings = useQuery({ queryKey: key('settings'), queryFn: () => api().v1.settings.get() });
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (next: Record<string, string>) => api().v1.settings.update(next),
    onSuccess: (data) => {
      queryClient.setQueryData(key('settings'), data);
      toast.success('Settings saved');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  useEffect(() => {
    if (settings.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initialise the form from loaded settings
      setValues(
        Object.fromEntries(FIELDS.map((field) => [field.key, decode(settings.data[field.key])])),
      );
    }
  }, [settings.data]);

  if (settings.isPending) return <Skeleton className="h-64" />;
  if (settings.error)
    return <ApiErrorState error={settings.error} onRetry={() => void settings.refetch()} />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    save.mutate(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])));
  };

  return (
    <Card className="max-w-2xl">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <FormGrid>
          {FIELDS.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              hint={'hint' in field ? field.hint : undefined}
            >
              {'options' in field ? (
                <Select
                  options={[...field.options]}
                  value={values[field.key] ?? ''}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, [field.key]: event.target.value }))
                  }
                />
              ) : (
                <Input
                  value={values[field.key] ?? ''}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, [field.key]: event.target.value }))
                  }
                />
              )}
            </Field>
          ))}
        </FormGrid>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save settings
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EmailCheck() {
  const toast = useToast();
  const { user } = useSession();
  const [to, setTo] = useState('');
  const verify = useMutation({
    mutationFn: () => api().v1.settings.verifyEmail(),
    onSuccess: () => toast.success('Email delivery is configured correctly'),
    onError: (error) => toast.error('Email delivery check failed', errorMessage(error)),
  });
  const test = useMutation({
    mutationFn: () => api().v1.settings.sendTestEmail(to.trim() || undefined),
    onSuccess: () => toast.success('Test email sent', to.trim() || user?.email),
    onError: (error) => toast.error('Test email failed', errorMessage(error)),
  });
  return (
    <Card className="max-w-2xl">
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Email is sent with the server&apos;s mail configuration, which is managed by your operator
          and not editable here. Use these checks to confirm password-reset emails can be delivered.
        </p>
        <Button onClick={() => verify.mutate()} loading={verify.isPending}>
          Check email configuration
        </Button>
        <div className="flex flex-wrap items-end gap-2">
          <Field
            label="Send a test email to"
            hint={`Defaults to ${user?.email ?? 'your address'}`}
            className="w-full sm:w-80"
          >
            <Input type="email" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Button onClick={() => test.mutate()} loading={test.isPending}>
            Send test email
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AuditLog() {
  const key = useQueryKey();
  const { can } = useSession();
  const members = useMemberOptions(can('settings.users.read'));
  const [filters, setFilters] = useState({ user_id: '', action: '', start_date: '', end_date: '' });
  const [page, setPage] = useState(1);
  const query = {
    page,
    limit: 25,
    ...(filters.user_id ? { user_id: Number(filters.user_id) } : {}),
    ...(filters.action.trim()
      ? { action: filters.action.trim().toUpperCase().replace(/\s+/g, '_') }
      : {}),
    ...(filters.start_date ? { start_date: toIsoOrNull(filters.start_date) ?? undefined } : {}),
    ...(filters.end_date
      ? { end_date: toIsoOrNull(`${filters.end_date}T23:59:59`) ?? undefined }
      : {}),
  };
  const log = useQuery({
    queryKey: key('audit', query),
    queryFn: () => api().v1.audit.list(query),
    placeholderData: keepPreviousData,
  });
  const set = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const columns: Column<AuditLogEntry>[] = [
    {
      id: 'when',
      header: 'When',
      cell: (e) => <span className="whitespace-nowrap">{formatDateTime(e.created_at)}</span>,
    },
    {
      id: 'actor',
      header: 'By',
      cell: (e) => e.user_email ?? <span className="text-muted">System</span>,
    },
    { id: 'action', header: 'Action', cell: (e) => humanizeCode(e.action) },
    {
      id: 'record',
      header: 'Record',
      hideBelow: 'sm',
      cell: (e) => `${humanizeCode(e.table_name)}${e.record_id !== null ? ` #${e.record_id}` : ''}`,
    },
    {
      id: 'fields',
      header: 'Changed fields',
      hideBelow: 'md',
      // Values are not shown: field names are enough to review activity.
      cell: (e) => {
        const fields =
          e.new_values && typeof e.new_values === 'object'
            ? Object.keys(e.new_values as object)
            : [];
        return fields.length ? (
          <span className="text-xs text-muted">{fields.join(', ')}</span>
        ) : (
          '—'
        );
      },
    },
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        {can('settings.users.read') && (
          <Select
            aria-label="Member"
            className="w-48"
            placeholder="Anyone"
            options={members.data ?? []}
            value={filters.user_id}
            onChange={(event) => set({ user_id: event.target.value })}
          />
        )}
        <Input
          aria-label="Action"
          placeholder="Action, e.g. update lead"
          className="w-56"
          value={filters.action}
          onChange={(event) => set({ action: event.target.value })}
        />
        <Input
          aria-label="From date"
          type="date"
          className="w-40"
          value={filters.start_date}
          onChange={(event) => set({ start_date: event.target.value })}
        />
        <Input
          aria-label="To date"
          type="date"
          className="w-40"
          value={filters.end_date}
          onChange={(event) => set({ end_date: event.target.value })}
        />
      </div>
      <DataTable
        caption="Audit log"
        columns={columns}
        rows={log.data?.items}
        rowKey={(e) => e.id}
        loading={log.isPending}
        error={log.error}
        onRetry={() => void log.refetch()}
        pagination={log.data?.pagination}
        onPageChange={setPage}
        empty={<EmptyState title="No audit entries match" />}
      />
    </>
  );
}
