'use client';

import type { Customer } from '@crm/types';
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  EmptyState,
  Field,
  FormGrid,
  Input,
  MoreIcon,
  PageHeader,
  PlusIcon,
  Textarea,
  useToast,
} from '@crm/ui';
import { createCustomerSchema } from '@crm/validation';
import { useState } from 'react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { applyServerErrors, useZodForm } from '@/components/forms/form';
import { FormSheet } from '@/components/forms/FormSheet';
import { MemberSelect } from '@/components/forms/pickers';
import { useListParams } from '@/hooks/useListParams';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useMemberOptions } from '@/modules/organization/hooks';
import { useSession } from '@/providers/SessionProvider';
import { useCustomerMutations, useCustomers } from './hooks';

export function CustomersScreen() {
  const session = useSession();
  const toast = useToast();
  const { params, page, setParams } = useListParams([] as const, { sort: '-created_at' });
  const customers = useCustomers({ page, limit: 20, sort: params.sort });
  const members = useMemberOptions(session.can('settings.users.read'));
  const memberName = (id: number | null) =>
    id === null ? null : (members.data?.find((m) => m.value === String(id))?.label ?? null);
  const { remove } = useCustomerMutations();
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const canEdit = (c: Customer) =>
    session.canOrg('crm.customers.update') ||
    (session.can('crm.customers.update') && c.assigned_to === session.user?.id);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success('Customer deleted', deleting.name);
      setDeleting(null);
    } catch (error) {
      toast.error('Could not delete customer', errorMessage(error));
    }
  };

  const columns: Column<Customer>[] = [
    {
      id: 'name',
      header: 'Name',
      sortField: 'name',
      cell: (c) => (
        <div>
          <p className="font-medium">{c.name}</p>
          <p className="text-xs text-muted sm:hidden">{c.email}</p>
        </div>
      ),
    },
    {
      id: 'email',
      header: 'Email',
      sortField: 'email',
      hideBelow: 'sm',
      cell: (c) => (
        <a href={`mailto:${c.email}`} className="hover:underline">
          {c.email}
        </a>
      ),
    },
    { id: 'phone', header: 'Phone', hideBelow: 'md', cell: (c) => c.phone ?? '—' },
    {
      id: 'owner',
      header: 'Assigned to',
      hideBelow: 'md',
      cell: (c) =>
        c.assigned_to === null ? (
          <span className="text-muted">Unassigned</span>
        ) : c.assigned_to === session.user?.id ? (
          'You'
        ) : (
          (memberName(c.assigned_to) ?? 'Team member')
        ),
    },
    {
      id: 'created',
      header: 'Added',
      sortField: 'created_at',
      hideBelow: 'lg',
      cell: (c) => formatDate(c.created_at),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-10 text-right',
      cell: (c) => {
        const items = [
          ...(canEdit(c) ? [{ label: 'Edit', onSelect: () => setEditing(c) }] : []),
          ...(session.can('crm.customers.delete')
            ? [{ label: 'Delete…', tone: 'danger' as const, onSelect: () => setDeleting(c) }]
            : []),
        ];
        return items.length ? (
          <DropdownMenu label={`Actions for ${c.name}`} trigger={<MoreIcon />} items={items} />
        ) : null;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description={customers.data ? `${customers.data.pagination.total} customers` : undefined}
        actions={
          <PermissionGate permission="crm.customers.create">
            <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
              New customer
            </Button>
          </PermissionGate>
        }
      />
      <DataTable
        caption="Customers"
        columns={columns}
        rows={customers.data?.items}
        rowKey={(c) => c.id}
        loading={customers.isPending}
        error={customers.error}
        onRetry={() => void customers.refetch()}
        sort={params.sort}
        onSortChange={(sort) => setParams({ sort })}
        pagination={customers.data?.pagination}
        onPageChange={(next) => setParams({ page: next })}
        empty={
          <EmptyState
            title="No customers yet"
            description="Customers are added here or created automatically when a lead is converted."
            action={
              session.can('crm.customers.create') ? (
                <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
                  New customer
                </Button>
              ) : undefined
            }
          />
        }
      />
      <CustomerFormSheet
        open={creating || editing !== null}
        customer={editing}
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
        title="Delete customer?"
        confirmLabel="Delete customer"
        description={
          <>
            <strong className="text-fg">{deleting?.name}</strong> will be permanently deleted. This
            cannot be undone.
          </>
        }
      />
    </>
  );
}

interface CustomerFormSheetProps {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
}

function CustomerFormSheet(props: CustomerFormSheetProps) {
  return props.open ? <CustomerForm key={props.customer?.id ?? 'new'} {...props} /> : null;
}

function CustomerForm({ open, customer, onClose }: CustomerFormSheetProps) {
  const { canOrg } = useSession();
  const canPickAssignee = canOrg('crm.customers.create') && canOrg('crm.customers.update');
  const { create, update } = useCustomerMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createCustomerSchema, {
    defaultValues: {
      name: customer?.name ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      address: customer?.address ?? '',
      assigned_to: customer?.assigned_to == null ? '' : String(customer.assigned_to),
    },
  });
  const { register, handleSubmit, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { assigned_to, ...rest } = values;
    const body = { ...rest, ...(canPickAssignee ? { assigned_to: assigned_to ?? null } : {}) };
    try {
      if (customer) await update.mutateAsync({ id: customer.id, input: body });
      else await create.mutateAsync(body);
      toast.success(customer ? 'Customer updated' : 'Customer created', values.name);
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={customer ? 'Edit customer' : 'New customer'}
      submitLabel={customer ? 'Save changes' : 'Create customer'}
      saving={create.isPending || update.isPending}
      error={formError}
      onSubmit={onSubmit}
    >
      <FormGrid>
        <Field label="Name" required error={errors.name?.message} className="sm:col-span-2">
          <Input {...register('name')} />
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          <Input type="email" {...register('email')} />
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          <Input type="tel" {...register('phone')} />
        </Field>
        {canPickAssignee && (
          <Field label="Assigned to" error={errors.assigned_to?.message}>
            <MemberSelect {...register('assigned_to')} />
          </Field>
        )}
        <Field label="Address" error={errors.address?.message} className="sm:col-span-2">
          <Textarea rows={3} {...register('address')} />
        </Field>
      </FormGrid>
    </FormSheet>
  );
}
