import type { Opportunity } from '@crm/types';
import { createOpportunitySchema } from '@crm/validation';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import {
  applyServerErrors,
  FormDate,
  FormSelect,
  FormText,
  useZodForm,
} from '../../components/forms/form';
import { FormActions, FormError, LeadSelect, MemberSelect } from '../../components/forms/pickers';
import { Badge, ErrorState, LoadingState, Screen, Section, useToast } from '../../components/ui';
import { STAGE_OPTIONS, STAGE_TONE } from '../../lib/labels';
import type { RootScreenProps } from '../../navigation/types';
import { useSession } from '../../providers/SessionProvider';
import { useCanEditOpportunity, useOpportunity, useOpportunityMutations } from './hooks';

export function OpportunityFormScreen({ route }: RootScreenProps<'OpportunityForm'>) {
  const id = route.params?.id;
  const opportunity = useOpportunity(id ?? 0);
  if (id === undefined) return <OpportunityForm leadId={route.params?.leadId} />;
  if (opportunity.isPending)
    return (
      <Screen title="Opportunity" back>
        <LoadingState />
      </Screen>
    );
  if (opportunity.error) {
    return (
      <Screen title="Opportunity" back>
        <ErrorState error={opportunity.error} onRetry={() => void opportunity.refetch()} />
      </Screen>
    );
  }
  return <OpportunityForm opportunity={opportunity.data} />;
}

const toValues = (o: Opportunity) => ({
  lead_id: String(o.lead_id),
  title: o.title,
  description: o.description ?? '',
  value: o.value ?? '',
  stage: o.stage,
  probability: o.probability === null ? '' : String(o.probability),
  expected_close_date: o.expected_close_date ?? '',
  assigned_to: o.assigned_to === null ? '' : String(o.assigned_to),
});

/**
 * Create / view / edit an opportunity with the shared schema. Without edit
 * rights the form is read-only; reassignment needs an organization-wide grant.
 */
function OpportunityForm({
  opportunity,
  leadId,
}: {
  opportunity?: Opportunity;
  leadId?: number | undefined;
}) {
  const navigation = useNavigation();
  const { canOrg } = useSession();
  const canEdit = useCanEditOpportunity();
  const editable = !opportunity || canEdit(opportunity);
  const canAssign = canOrg('crm.opportunities.assign');
  const { create, update, assign } = useOpportunityMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createOpportunitySchema, {
    defaultValues: opportunity
      ? toValues(opportunity)
      : {
          lead_id: leadId ? String(leadId) : '',
          title: '',
          description: '',
          value: '',
          stage: 'Prospecting',
          probability: '',
          expected_close_date: '',
          assigned_to: '',
        },
  });
  const { control, handleSubmit } = form;
  const saving = create.isPending || update.isPending || assign.isPending;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const { lead_id, assigned_to, ...rest } = values;
    try {
      if (opportunity) {
        await update.mutateAsync({ id: opportunity.id, input: rest });
        if (canAssign && (assigned_to ?? null) !== opportunity.assigned_to) {
          await assign.mutateAsync({
            id: opportunity.id,
            input: { assigned_to: assigned_to ?? null },
          });
        }
        toast.success('Opportunity updated', rest.title);
      } else {
        await create.mutateAsync({
          lead_id,
          ...rest,
          ...(canAssign && assigned_to != null ? { assigned_to } : {}),
        });
        toast.success('Opportunity created', rest.title);
      }
      navigation.goBack();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  const title = opportunity ? (editable ? 'Edit opportunity' : 'Opportunity') : 'New opportunity';
  return (
    <Screen
      title={title}
      subtitle={opportunity?.lead_name ?? undefined}
      back
      scroll
      keyboard
      actions={
        opportunity ? (
          <Badge label={opportunity.stage} tone={STAGE_TONE[opportunity.stage]} />
        ) : null
      }
    >
      <FormError message={formError} />
      <Section title="Deal">
        {opportunity ? null : (
          <Controller
            control={control}
            name="lead_id"
            render={({ field, fieldState }) => (
              <LeadSelect
                value={field.value ? String(field.value) : null}
                onChange={(v) => field.onChange(v ?? '')}
                error={fieldState.error?.message}
              />
            )}
          />
        )}
        <FormText control={control} name="title" label="Title" required editable={editable} />
        <FormText
          control={control}
          name="description"
          label="Description"
          multiline
          editable={editable}
        />
        <FormSelect control={control} name="stage" label="Stage" options={STAGE_OPTIONS} />
        <FormText
          control={control}
          name="value"
          label="Value"
          keyboardType="decimal-pad"
          editable={editable}
        />
        <FormText
          control={control}
          name="probability"
          label="Probability (%)"
          keyboardType="number-pad"
          maxLength={3}
          editable={editable}
        />
        <FormDate
          control={control}
          name="expected_close_date"
          label="Expected close date"
          mode="date"
        />
        {canAssign ? (
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
          submitLabel={opportunity ? 'Save changes' : 'Create opportunity'}
          saving={saving}
          onSubmit={() => void submit()}
          onCancel={() => navigation.goBack()}
        />
      ) : null}
    </Screen>
  );
}
