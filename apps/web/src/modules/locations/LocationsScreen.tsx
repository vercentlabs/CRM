'use client';

import type { ExecutiveLocation, SalesLocation } from '@crm/types';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DropdownMenu,
  EmptyState,
  Field,
  FormGrid,
  Input,
  MapPinIcon,
  MoreIcon,
  PageHeader,
  PlusIcon,
  Select,
  Tabs,
  Textarea,
  useToast,
} from '@crm/ui';
import { createLocationSchema } from '@crm/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { applyServerErrors, useZodForm } from '@/components/forms/form';
import { FormSheet } from '@/components/forms/FormSheet';
import { MemberSelect } from '@/components/forms/pickers';
import { useListParams } from '@/hooks/useListParams';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import { useQueryKey, useSession } from '@/providers/SessionProvider';

const REFRESH_OPTIONS = [
  { value: '60000', label: 'Every minute' },
  { value: '120000', label: 'Every 2 minutes' },
  { value: '300000', label: 'Every 5 minutes' },
  { value: '600000', label: 'Every 10 minutes' },
];

export function LocationsScreen() {
  const { can } = useSession();
  const { params, setParams } = useListParams(['view'] as const);
  const tabs = [
    ...(can('crm.locations.read')
      ? [{ id: 'branches', label: 'Branches', content: <Branches /> }]
      : []),
    ...(can('crm.locations.read')
      ? [{ id: 'team', label: 'Team locations', content: <TeamLocations /> }]
      : []),
    ...(can('crm.locations.checkin')
      ? [{ id: 'checkin', label: 'My check-in', content: <CheckIn /> }]
      : []),
  ];
  const current = tabs.find((t) => t.id === params.view)?.id ?? tabs[0]?.id ?? 'branches';
  return (
    <>
      <PageHeader title="Locations" />
      <Tabs
        label="Location views"
        value={current}
        onChange={(id) => setParams({ view: id })}
        tabs={tabs}
      />
    </>
  );
}

function useLocationMutations() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key('locations') });
  return {
    create: useMutation({ mutationFn: api().v1.locations.create, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: number;
        input: Parameters<ReturnType<typeof api>['v1']['locations']['update']>[1];
      }) => api().v1.locations.update(id, input),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api().v1.locations.remove(id),
      onSuccess: invalidate,
    }),
  };
}

function Branches() {
  const key = useQueryKey();
  const { can } = useSession();
  const toast = useToast();
  const locations = useQuery({
    queryKey: key('locations', 'list'),
    queryFn: () => api().v1.locations.list(),
  });
  const { remove } = useLocationMutations();
  const [editing, setEditing] = useState<SalesLocation | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<SalesLocation | null>(null);
  const manage = can('crm.locations.manage');

  const columns: Column<SalesLocation>[] = [
    { id: 'name', header: 'Branch', cell: (l) => <span className="font-medium">{l.name}</span> },
    {
      id: 'city',
      header: 'City',
      cell: (l) => [l.city, l.state].filter(Boolean).join(', ') || '—',
    },
    { id: 'address', header: 'Address', hideBelow: 'lg', cell: (l) => l.address ?? '—' },
    { id: 'phone', header: 'Contact', hideBelow: 'md', cell: (l) => l.contact_phone ?? '—' },
    { id: 'manager', header: 'Manager', hideBelow: 'sm', cell: (l) => l.manager_name ?? '—' },
    ...(manage
      ? [
          {
            id: 'actions',
            header: <span className="sr-only">Actions</span>,
            className: 'w-10 text-right',
            cell: (l: SalesLocation) => (
              <DropdownMenu
                label={`Actions for ${l.name}`}
                trigger={<MoreIcon />}
                items={[
                  { label: 'Edit', onSelect: () => setEditing(l) },
                  { label: 'Delete…', tone: 'danger' as const, onSelect: () => setDeleting(l) },
                ]}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      {manage && (
        <div className="mb-3 flex justify-end">
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
            New branch
          </Button>
        </div>
      )}
      <DataTable
        caption="Branches"
        columns={columns}
        rows={locations.data}
        rowKey={(l) => l.id}
        loading={locations.isPending}
        error={locations.error}
        onRetry={() => void locations.refetch()}
        empty={<EmptyState title="No branches yet" />}
      />
      <LocationFormSheet
        open={creating || editing !== null}
        location={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        loading={remove.isPending}
        title="Delete branch?"
        confirmLabel="Delete branch"
        description={`${deleting?.name ?? ''} will be permanently deleted. Branches still referenced by leads cannot be deleted.`}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Branch deleted', deleting.name);
              setDeleting(null);
            },
            onError: (error) => toast.error('Could not delete branch', errorMessage(error)),
          })
        }
      />
    </>
  );
}

interface LocationFormSheetProps {
  open: boolean;
  location: SalesLocation | null;
  onClose: () => void;
}

function LocationFormSheet(props: LocationFormSheetProps) {
  return props.open ? <LocationForm key={props.location?.id ?? 'new'} {...props} /> : null;
}

function LocationForm({ open, location, onClose }: LocationFormSheetProps) {
  const { create, update } = useLocationMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createLocationSchema, {
    defaultValues: {
      name: location?.name ?? '',
      address: location?.address ?? '',
      city: location?.city ?? '',
      state: location?.state ?? '',
      country: location?.country ?? 'India',
      pin_code: location?.pin_code ?? '',
      contact_phone: location?.contact_phone ?? '',
      manager_id: location?.manager_id == null ? '' : String(location.manager_id),
    },
  });
  const { register, handleSubmit, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (location) await update.mutateAsync({ id: location.id, input: values });
      else await create.mutateAsync(values);
      toast.success(location ? 'Branch updated' : 'Branch created', values.name);
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={location ? 'Edit branch' : 'New branch'}
      submitLabel={location ? 'Save changes' : 'Create branch'}
      saving={create.isPending || update.isPending}
      error={formError}
      onSubmit={onSubmit}
    >
      <FormGrid>
        <Field label="Name" required error={errors.name?.message} className="sm:col-span-2">
          <Input {...register('name')} />
        </Field>
        <Field label="Address" error={errors.address?.message} className="sm:col-span-2">
          <Textarea rows={2} {...register('address')} />
        </Field>
        <Field label="City" error={errors.city?.message}>
          <Input {...register('city')} />
        </Field>
        <Field label="State" error={errors.state?.message}>
          <Input {...register('state')} />
        </Field>
        <Field label="Country" required error={errors.country?.message}>
          <Input {...register('country')} />
        </Field>
        <Field label="PIN code" error={errors.pin_code?.message}>
          <Input inputMode="numeric" {...register('pin_code')} />
        </Field>
        <Field label="Contact phone" error={errors.contact_phone?.message}>
          <Input type="tel" {...register('contact_phone')} />
        </Field>
        <Field label="Manager" error={errors.manager_id?.message}>
          <MemberSelect {...register('manager_id')} placeholder="No manager" />
        </Field>
      </FormGrid>
    </FormSheet>
  );
}

function TeamLocations() {
  const key = useQueryKey();
  const [interval, setIntervalMs] = useState('120000');
  const executives = useQuery({
    queryKey: key('locations', 'executives'),
    queryFn: () => api().v1.locations.executives(),
    refetchInterval: Number(interval),
  });
  const columns: Column<ExecutiveLocation>[] = [
    {
      id: 'name',
      header: 'Member',
      cell: (e) => <span className="font-medium">{e.full_name}</span>,
    },
    {
      id: 'where',
      header: 'Last location',
      cell: (e) =>
        e.latitude && e.longitude ? (
          <a
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(e.latitude)}&mlon=${encodeURIComponent(e.longitude)}#map=16/${encodeURIComponent(e.latitude)}/${encodeURIComponent(e.longitude)}`}
          >
            {e.address || `${Number(e.latitude).toFixed(5)}, ${Number(e.longitude).toFixed(5)}`}
            <span className="sr-only"> (opens map in a new tab)</span>
          </a>
        ) : (
          <span className="text-muted">Not shared yet</span>
        ),
    },
    {
      id: 'updated',
      header: 'Updated',
      cell: (e) => (e.updated_at ? formatRelative(e.updated_at) : '—'),
    },
  ];
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Select
          aria-label="Auto refresh"
          className="w-48"
          options={REFRESH_OPTIONS}
          value={interval}
          onChange={(event) => setIntervalMs(event.target.value)}
        />
        <Button
          onClick={() => void executives.refetch()}
          loading={executives.isFetching && !executives.isPending}
        >
          Refresh now
        </Button>
      </div>
      <DataTable
        caption="Team locations"
        columns={columns}
        rows={executives.data}
        rowKey={(e) => e.id}
        loading={executives.isPending}
        error={executives.error}
        onRetry={() => void executives.refetch()}
        empty={<EmptyState title="No team member has shared a location yet" />}
      />
    </>
  );
}

function CheckIn() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [locating, setLocating] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const checkIn = useMutation({ mutationFn: api().v1.locations.checkIn });

  const share = () => {
    setError(null);
    if (!('geolocation' in navigator)) {
      setError('This browser cannot share a location.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        checkIn.mutate(
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            ...(address.trim() ? { address: address.trim() } : {}),
          },
          {
            onSuccess: () => {
              setLast(new Date().toISOString());
              toast.success('Location shared');
            },
            onError: (err) => setError(errorMessage(err)),
            onSettled: () => setLocating(false),
          },
        );
      },
      (geoError) => {
        setLocating(false);
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? 'Location access was denied. Allow it in your browser settings to check in.'
            : 'Your location could not be determined. Try again.',
        );
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <Card title="Share my current location" className="max-w-xl">
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          Your location is shared only when you press the button. Managers in your organization can
          see your last check-in.
        </p>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Place or note (optional)">
          <Input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="e.g. Client office, Andheri"
          />
        </Field>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            icon={<MapPinIcon />}
            loading={locating || checkIn.isPending}
            onClick={share}
          >
            Check in now
          </Button>
          {last && <span className="text-xs text-muted">Last shared {formatRelative(last)}</span>}
        </div>
      </div>
    </Card>
  );
}
