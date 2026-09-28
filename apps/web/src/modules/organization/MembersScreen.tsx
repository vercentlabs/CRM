'use client';

import type { Member } from '@crm/types';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DropdownMenu,
  EmptyState,
  Field,
  FormGrid,
  Input,
  MoreIcon,
  PageHeader,
  PlusIcon,
  Select,
  useToast,
} from '@crm/ui';
import { createMemberSchema } from '@crm/validation';
import { useState } from 'react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { applyServerErrors, useZodForm } from '@/components/forms/form';
import { FormSheet } from '@/components/forms/FormSheet';
import { useListParams } from '@/hooks/useListParams';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/providers/SessionProvider';
import { useMemberMutations, useMembers, useRoles } from './hooks';

const STATUS_TONE = { active: 'success', invited: 'info', suspended: 'neutral' } as const;

/**
 * Members of the active organization: identity (name, email) + membership
 * (role, status). Users of other organizations are never listed.
 */
export function MembersScreen() {
  const session = useSession();
  const toast = useToast();
  const { page, setParams } = useListParams([] as const);
  const members = useMembers(page, 25);
  const { update } = useMemberMutations();
  const [adding, setAdding] = useState(false);
  const [changingRole, setChangingRole] = useState<Member | null>(null);
  const canManage = session.can('settings.users.manage');

  const setStatus = (member: Member, status: 'active' | 'suspended') =>
    update.mutate(
      { userId: member.id, input: { status } },
      {
        onSuccess: () =>
          toast.success(
            status === 'active' ? 'Member reactivated' : 'Member suspended',
            member.full_name,
          ),
        onError: (error) => toast.error('Could not change status', errorMessage(error)),
      },
    );

  const columns: Column<Member>[] = [
    {
      id: 'name',
      header: 'Member',
      cell: (m) => (
        <div>
          <p className="font-medium">
            {m.full_name}
            {m.id === session.user?.id && <span className="ml-1 text-xs text-muted">(you)</span>}
          </p>
          <p className="text-xs text-muted">{m.email}</p>
        </div>
      ),
    },
    { id: 'role', header: 'Role', cell: (m) => m.role_name },
    {
      id: 'status',
      header: 'Status',
      cell: (m) => (
        <Badge tone={STATUS_TONE[m.membership_status]}>
          {m.membership_status === 'invited'
            ? 'Invited'
            : m.membership_status === 'active'
              ? 'Active'
              : 'Suspended'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-10 text-right',
      cell: (m) => {
        if (!canManage || m.id === session.user?.id || m.membership_status === 'invited')
          return null;
        return (
          <DropdownMenu
            label={`Actions for ${m.full_name}`}
            trigger={<MoreIcon />}
            items={[
              { label: 'Change role…', onSelect: () => setChangingRole(m) },
              m.membership_status === 'active'
                ? {
                    label: 'Suspend',
                    tone: 'danger' as const,
                    onSelect: () => setStatus(m, 'suspended'),
                  }
                : { label: 'Reactivate', onSelect: () => setStatus(m, 'active') },
            ]}
          />
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Members"
        description="People with access to this organization"
        actions={
          <PermissionGate permission="settings.users.manage">
            <Button variant="primary" icon={<PlusIcon />} onClick={() => setAdding(true)}>
              Add member
            </Button>
          </PermissionGate>
        }
      />
      <DataTable
        caption="Members"
        columns={columns}
        rows={members.data?.items}
        rowKey={(m) => m.id}
        loading={members.isPending}
        error={members.error}
        onRetry={() => void members.refetch()}
        pagination={members.data?.pagination}
        onPageChange={(next) => setParams({ page: next })}
        empty={<EmptyState title="No members" />}
      />
      <AddMemberSheet open={adding} onClose={() => setAdding(false)} />
      <RoleDialog member={changingRole} onClose={() => setChangingRole(null)} />
    </>
  );
}

function AddMemberSheet(props: { open: boolean; onClose: () => void }) {
  return props.open ? <AddMemberForm {...props} /> : null;
}

function AddMemberForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const roles = useRoles();
  const { add } = useMemberMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createMemberSchema, {
    defaultValues: { full_name: '', email: '', password: '', roleKey: 'sales' },
  });
  const { register, handleSubmit, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const member = await add.mutateAsync(values);
      toast.success(
        member.membership_status === 'invited' ? 'Invitation created' : 'Member added',
        member.membership_status === 'invited'
          ? `${member.email} already has an account and must accept the invitation.`
          : member.email,
      );
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title="Add member"
      description="If the email already has an account, it is invited instead and keeps its own password."
      submitLabel="Add member"
      saving={add.isPending}
      error={formError}
      onSubmit={onSubmit}
    >
      <FormGrid>
        <Field
          label="Full name"
          required
          error={errors.full_name?.message}
          className="sm:col-span-2"
        >
          <Input autoComplete="off" {...register('full_name')} />
        </Field>
        <Field label="Email" required error={errors.email?.message} className="sm:col-span-2">
          <Input type="email" autoComplete="off" {...register('email')} />
        </Field>
        <Field
          label="Initial password"
          required
          hint="At least 8 characters with a letter and a number"
          error={errors.password?.message}
        >
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="Role" required error={errors.roleKey?.message}>
          <Select
            options={(roles.data ?? []).map((r) => ({ value: r.key, label: r.name }))}
            {...register('roleKey')}
          />
        </Field>
      </FormGrid>
    </FormSheet>
  );
}

function RoleDialog({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const roles = useRoles();
  const { update } = useMemberMutations();
  const toast = useToast();
  const [roleKey, setRoleKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  if (member && member.id !== lastId) {
    setLastId(member.id);
    setRoleKey(member.role_key);
    setError(null);
  }
  const submit = async () => {
    if (!member) return;
    try {
      await update.mutateAsync({ userId: member.id, input: { roleKey } });
      toast.success('Role changed', member.full_name);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Dialog
      open={member !== null}
      onClose={onClose}
      title="Change role"
      description={member?.full_name}
      busy={update.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button variant="primary" loading={update.isPending} onClick={() => void submit()}>
            Save role
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}
      <Field label="Role" hint="You can only grant roles within your own privileges.">
        <Select
          options={(roles.data ?? []).map((r) => ({ value: r.key, label: r.name }))}
          value={roleKey}
          onChange={(event) => setRoleKey(event.target.value)}
        />
      </Field>
    </Dialog>
  );
}
