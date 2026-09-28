import type { Lead } from '@crm/types';
import { createLeadSchema } from '@crm/validation';
import { StackActions, useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import {
  applyServerErrors,
  FormDate,
  FormSelect,
  FormSwitch,
  FormText,
  useZodForm,
} from '../../components/forms/form';
import { FormActions, FormError, MemberSelect } from '../../components/forms/pickers';
import { ErrorState, LoadingState, Screen, Section, useToast } from '../../components/ui';
import { LEAD_SOURCE_OPTIONS, LEAD_STATUS_OPTIONS } from '../../lib/labels';
import type { RootScreenProps } from '../../navigation/types';
import { useSession } from '../../providers/SessionProvider';
import { useLead, useLeadMutations } from './hooks';

const blank = {
  full_name: '',
  mobile_number: '',
  alternate_number: '',
  email: '',
  source: '',
  status: 'New',
  next_call_at: '',
  age: '',
  occupation: '',
  monthly_income: '',
  address: '',
  notes: '',
  is_aware_of_digital_gold: false,
  assigned_to: '',
} as const;

const toValues = (lead: Lead) => ({
  full_name: lead.full_name,
  mobile_number: lead.mobile_number,
  alternate_number: lead.alternate_number ?? '',
  email: lead.email ?? '',
  source: lead.source ?? '',
  status: lead.status,
  next_call_at: lead.next_call_at ?? '',
  age: lead.age === null ? '' : String(lead.age),
  occupation: lead.occupation ?? '',
  monthly_income: lead.monthly_income ?? '',
  address: lead.address ?? '',
  notes: lead.notes ?? '',
  is_aware_of_digital_gold: lead.is_aware_of_digital_gold,
  assigned_to: '',
});

export function LeadFormScreen({ route }: RootScreenProps<'LeadForm'>) {
  const id = route.params?.id;
  const lead = useLead(id ?? 0);
  if (id === undefined) return <LeadForm />;
  if (lead.isPending)
    return (
      <Screen title="Edit lead" back>
        <LoadingState />
      </Screen>
    );
  if (lead.error)
    return (
      <Screen title="Edit lead" back>
        <ErrorState error={lead.error} onRetry={() => void lead.refetch()} />
      </Screen>
    );
  return <LeadForm lead={lead.data} />;
}

/**
 * Create / edit with the shared createLeadSchema. Assignment is offered only
 * with an organization-wide assign grant (own-scope creators are assigned by
 * the API); on edit it is a separate action on the lead.
 */
function LeadForm({ lead }: { lead?: Lead }) {
  const navigation = useNavigationBack();
  const { canOrg } = useSession();
  const canPickAssignee = !lead && canOrg('crm.leads.assign');
  const { create, update } = useLeadMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createLeadSchema, {
    defaultValues: lead ? toValues(lead) : { ...blank },
  });
  const { control, handleSubmit } = form;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const { assigned_to, ...rest } = values;
    const body = { ...rest, ...(canPickAssignee && assigned_to != null ? { assigned_to } : {}) };
    try {
      const saved = lead
        ? await update.mutateAsync({ id: lead.id, input: body })
        : await create.mutateAsync(body);
      toast.success(lead ? 'Lead updated' : 'Lead created', saved.full_name);
      navigation.replaceWithDetail(saved.id, Boolean(lead));
    } catch (error) {
      // The form keeps what the user typed, so a transient failure loses nothing.
      setFormError(applyServerErrors(form, error));
    }
  });

  return (
    <Screen title={lead ? 'Edit lead' : 'New lead'} back scroll keyboard>
      <FormError message={formError} />
      <Section title="Contact">
        <FormText
          control={control}
          name="full_name"
          label="Full name"
          required
          autoCapitalize="words"
        />
        <FormText
          control={control}
          name="mobile_number"
          label="Mobile number"
          required
          hint="10 digits"
          keyboardType="phone-pad"
          maxLength={10}
        />
        <FormText
          control={control}
          name="alternate_number"
          label="Alternate number"
          keyboardType="phone-pad"
          maxLength={10}
        />
        <FormText
          control={control}
          name="email"
          label="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
      </Section>
      <Section title="Pipeline">
        <FormSelect control={control} name="status" label="Status" options={LEAD_STATUS_OPTIONS} />
        <FormSelect
          control={control}
          name="source"
          label="Source"
          options={LEAD_SOURCE_OPTIONS}
          allowClear
          clearLabel="Not specified"
          placeholder="Not specified"
        />
        <FormDate control={control} name="next_call_at" label="Next call" />
        {canPickAssignee ? (
          <Controller
            control={control}
            name="assigned_to"
            render={({ field, fieldState }) => (
              <MemberSelect
                value={field.value as string}
                onChange={(v) => field.onChange(v ?? '')}
                error={fieldState.error?.message}
              />
            )}
          />
        ) : null}
      </Section>
      <Section title="Profile">
        <FormText
          control={control}
          name="age"
          label="Age"
          keyboardType="number-pad"
          maxLength={3}
        />
        <FormText control={control} name="occupation" label="Occupation" />
        <FormText
          control={control}
          name="monthly_income"
          label="Monthly income"
          keyboardType="decimal-pad"
        />
        <FormText control={control} name="address" label="Address" multiline />
        <FormText control={control} name="notes" label="Notes" multiline />
        <FormSwitch
          control={control}
          name="is_aware_of_digital_gold"
          label="Aware of digital gold"
        />
      </Section>
      <FormActions
        submitLabel={lead ? 'Save changes' : 'Create lead'}
        saving={create.isPending || update.isPending}
        onSubmit={() => void submit()}
        onCancel={navigation.goBack}
      />
    </Screen>
  );
}

function useNavigationBack() {
  const navigation = useNavigation();
  return {
    goBack: () => navigation.goBack(),
    /** After create: open the new lead; after edit: return to it. */
    replaceWithDetail: (id: number, editing: boolean) => {
      if (editing) navigation.goBack();
      else navigation.dispatch(StackActions.replace('LeadDetail', { id }));
    },
  };
}
