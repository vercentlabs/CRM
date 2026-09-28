import type { Customer } from '@crm/types';
import { createCustomerSchema } from '@crm/validation';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { Linking } from 'react-native';
import { applyServerErrors, FormText, useZodForm } from '../../components/forms/form';
import { FormActions, FormError, MemberSelect } from '../../components/forms/pickers';
import {
  Button,
  confirm,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  Section,
  useToast,
} from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import type { RootScreenProps } from '../../navigation/types';
import { useSession } from '../../providers/SessionProvider';
import { useCustomer, useCustomerAccess, useCustomerMutations } from './hooks';

export function CustomerFormScreen({ route }: RootScreenProps<'CustomerForm'>) {
  const id = route.params?.id;
  const customer = useCustomer(id ?? 0);
  if (id === undefined) return <CustomerForm />;
  if (customer.isPending)
    return (
      <Screen title="Customer" back>
        <LoadingState />
      </Screen>
    );
  if (customer.error) {
    return (
      <Screen title="Customer" back>
        <ErrorState error={customer.error} onRetry={() => void customer.refetch()} />
      </Screen>
    );
  }
  return <CustomerForm customer={customer.data} />;
}

function CustomerForm({ customer }: { customer?: Customer }) {
  const navigation = useNavigation();
  const { canOrg } = useSession();
  const access = useCustomerAccess();
  const editable = !customer || access.canEdit(customer);
  const canAssign = canOrg('crm.customers.update') || canOrg('crm.customers.create');
  const { create, update, remove } = useCustomerMutations();
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
  const { control, handleSubmit } = form;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const { assigned_to, ...rest } = values;
    const body = { ...rest, ...(canAssign ? { assigned_to: assigned_to ?? null } : {}) };
    try {
      if (customer) await update.mutateAsync({ id: customer.id, input: body });
      else await create.mutateAsync(body);
      toast.success(customer ? 'Customer updated' : 'Customer created', rest.name);
      navigation.goBack();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  const onDelete = () => {
    if (!customer) return;
    confirm({
      title: 'Delete customer?',
      message: `${customer.name} will be permanently removed.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await remove.mutateAsync(customer.id);
          toast.success('Customer deleted', customer.name);
          navigation.goBack();
        } catch (error) {
          toast.error('Could not delete customer', errorMessage(error));
        }
      },
    });
  };

  return (
    <Screen
      title={customer ? (editable ? 'Edit customer' : 'Customer') : 'New customer'}
      back
      scroll
      keyboard
      actions={
        customer?.phone ? (
          <IconButton
            icon="phone"
            label={`Call ${customer.name}`}
            onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
          />
        ) : null
      }
    >
      <FormError message={formError} />
      <Section title="Details">
        <FormText
          control={control}
          name="name"
          label="Name"
          required
          autoCapitalize="words"
          editable={editable}
        />
        <FormText
          control={control}
          name="email"
          label="Email"
          required
          keyboardType="email-address"
          autoCapitalize="none"
          editable={editable}
        />
        <FormText
          control={control}
          name="phone"
          label="Phone"
          keyboardType="phone-pad"
          editable={editable}
        />
        <FormText control={control} name="address" label="Address" multiline editable={editable} />
        {canAssign && editable ? (
          <Controller
            control={control}
            name="assigned_to"
            render={({ field, fieldState }) => (
              <MemberSelect
                value={field.value ? String(field.value) : null}
                onChange={(v) => field.onChange(v ?? '')}
                error={fieldState.error?.message}
              />
            )}
          />
        ) : null}
      </Section>
      {editable ? (
        <FormActions
          submitLabel={customer ? 'Save changes' : 'Create customer'}
          saving={create.isPending || update.isPending}
          onSubmit={() => void submit()}
          onCancel={() => navigation.goBack()}
        />
      ) : null}
      {customer && access.canDelete(customer) ? (
        <Button
          label="Delete customer"
          variant="danger"
          icon="trash-2"
          onPress={onDelete}
          loading={remove.isPending}
        />
      ) : null}
    </Screen>
  );
}
