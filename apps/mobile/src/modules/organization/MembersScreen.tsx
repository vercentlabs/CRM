import type { Member } from '@crm/types';
import { createMemberSchema } from '@crm/validation';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { applyServerErrors, FormSelect, FormText, useZodForm } from '../../components/forms/form';
import { FormActions, FormError } from '../../components/forms/pickers';
import { ListRow, PagedList, usePagedQuery } from '../../components/lists/PagedList';
import {
  Avatar,
  Badge,
  Button,
  confirm,
  EmptyState,
  IconButton,
  Screen,
  Section,
  SelectField,
  Sheet,
  Text,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { useSession } from '../../providers/SessionProvider';
import { useMemberMutations, useRoles } from './hooks';

const STATUS_TONE = { active: 'success', invited: 'info', suspended: 'neutral' } as const;
const STATUS_LABEL = { active: 'Active', invited: 'Invited', suspended: 'Suspended' } as const;

/**
 * Members of the active organization: memberships with a role and status.
 * Users of other organizations are never listed. Changes need settings.users.manage.
 */
export function MembersScreen() {
  const navigation = useNavigation();
  const { can } = useSession();
  const canManage = can('settings.users.manage');
  const list = usePagedQuery<Member>(['members', 'list'], (page) =>
    api().v1.organizations.members({ page, limit: 25 }),
  );
  const [selected, setSelected] = useState<Member | null>(null);
  return (
    <Screen
      title="Members"
      subtitle={list.total !== undefined ? `${list.total} members` : undefined}
      actions={
        canManage ? (
          <IconButton
            icon="user-plus"
            label="Add member"
            onPress={() => navigation.navigate('AddMember')}
          />
        ) : null
      }
    >
      <PagedList
        query={list}
        keyExtractor={(m) => m.id}
        empty={<EmptyState icon="users" title="No members" />}
        renderItem={(m) => (
          <ListRow
            leading={<Avatar name={m.full_name} />}
            title={m.full_name}
            subtitle={m.email}
            meta={m.role_name}
            onPress={() => setSelected(m)}
            trailing={
              <Badge
                label={STATUS_LABEL[m.membership_status]}
                tone={STATUS_TONE[m.membership_status]}
              />
            }
          />
        )}
      />
      {selected ? (
        <MemberSheet key={selected.id} member={selected} onClose={() => setSelected(null)} />
      ) : null}
    </Screen>
  );
}

function MemberSheet({ member, onClose }: { member: Member; onClose: () => void }) {
  const { can, user } = useSession();
  const roles = useRoles();
  const { update } = useMemberMutations();
  const toast = useToast();
  const [roleKey, setRoleKey] = useState<string | null>(member.role_key);
  const [error, setError] = useState<string | null>(null);
  const isSelf = member.id === user?.id;
  const canManage =
    can('settings.users.manage') && !isSelf && member.membership_status !== 'invited';

  const saveRole = async () => {
    if (!roleKey || roleKey === member.role_key) return onClose();
    setError(null);
    try {
      await update.mutateAsync({ userId: member.id, input: { roleKey } });
      toast.success('Role updated', member.full_name);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const setStatus = (status: 'active' | 'suspended') => {
    const run = async () => {
      try {
        await update.mutateAsync({ userId: member.id, input: { status } });
        toast.success(
          status === 'active' ? 'Member reactivated' : 'Member suspended',
          member.full_name,
        );
        onClose();
      } catch (err) {
        setError(errorMessage(err));
      }
    };
    if (status === 'suspended') {
      confirm({
        title: 'Suspend member?',
        message: `${member.full_name} will be signed out of this organization and lose access until reactivated.`,
        confirmLabel: 'Suspend',
        onConfirm: () => void run(),
      });
    } else void run();
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={member.full_name}
      subtitle={member.email}
      busy={update.isPending}
    >
      <FormError message={error} />
      <View style={styles.row}>
        <Badge label={member.role_name} tone="info" />
        <Badge
          label={STATUS_LABEL[member.membership_status]}
          tone={STATUS_TONE[member.membership_status]}
        />
        {isSelf ? (
          <Text variant="caption" color="muted">
            (you)
          </Text>
        ) : null}
      </View>
      {canManage ? (
        <>
          <SelectField
            label="Role"
            value={roleKey}
            onChange={setRoleKey}
            loading={roles.isPending}
            options={(roles.data ?? []).map((r) => ({
              value: r.key,
              label: r.name,
              description: r.description ?? undefined,
            }))}
          />
          <FormActions
            submitLabel="Save role"
            saving={update.isPending}
            onSubmit={() => void saveRole()}
            onCancel={onClose}
          />
          {member.membership_status === 'active' ? (
            <Button
              label="Suspend member"
              variant="danger"
              onPress={() => setStatus('suspended')}
              disabled={update.isPending}
            />
          ) : (
            <Button
              label="Reactivate member"
              onPress={() => setStatus('active')}
              disabled={update.isPending}
            />
          )}
        </>
      ) : (
        <Text color="muted">
          {isSelf
            ? 'You cannot change your own role or status.'
            : member.membership_status === 'invited'
              ? 'This invitation is waiting to be accepted.'
              : 'Only members who manage users can change this.'}
        </Text>
      )}
    </Sheet>
  );
}

/** Adds an existing user by email, or creates the account; existing users receive an invitation. */
export function AddMemberScreen() {
  const navigation = useNavigation();
  const roles = useRoles();
  const { add } = useMemberMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createMemberSchema, {
    defaultValues: { full_name: '', email: '', password: '', roleKey: 'sales' },
  });
  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const member = await add.mutateAsync(values);
      toast.success(
        member.membership_status === 'invited' ? 'Invitation created' : 'Member added',
        member.membership_status === 'invited'
          ? `${member.email} can accept it after signing in.`
          : member.full_name,
      );
      navigation.goBack();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });
  const { control } = form;
  return (
    <Screen title="Add member" back scroll keyboard>
      <FormError message={formError} />
      <Section title="Member">
        <FormText
          control={control}
          name="full_name"
          label="Full name"
          required
          autoCapitalize="words"
        />
        <FormText
          control={control}
          name="email"
          label="Email"
          required
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FormText
          control={control}
          name="password"
          label="Initial password"
          required
          secureTextEntry
          hint="At least 8 characters with a letter and a number. Ignored if the user already has an account."
        />
        <FormSelect
          control={control}
          name="roleKey"
          label="Role"
          required
          options={(roles.data ?? []).map((r) => ({
            value: r.key,
            label: r.name,
            description: r.description ?? undefined,
          }))}
        />
      </Section>
      <FormActions
        submitLabel="Add member"
        saving={add.isPending}
        onSubmit={() => void submit()}
        onCancel={() => navigation.goBack()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8, alignItems: 'center' } });
