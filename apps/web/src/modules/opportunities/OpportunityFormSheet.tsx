'use client';

import type { Lead, Opportunity } from '@crm/types';
import { Field, FormGrid, Input, Select, Textarea, useToast, type ComboboxOption } from '@crm/ui';
import { createOpportunitySchema } from '@crm/validation';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { applyServerErrors, useZodForm } from '@/components/forms/form';
import { FormSheet } from '@/components/forms/FormSheet';
import { LeadPicker, MemberSelect, leadOption } from '@/components/forms/pickers';
import { toDateInput, toIsoOrNull } from '@/lib/format';
import { STAGE_OPTIONS } from '@/lib/labels';
import { useSession } from '@/providers/SessionProvider';
import { useOpportunityMutations } from './hooks';

type LeadRef = Pick<Lead, 'id' | 'full_name' | 'mobile_number' | 'email'>;

const blank = (leadId?: number) => ({
  lead_id: leadId ? String(leadId) : '',
  title: '',
  description: '',
  value: '',
  stage: 'Prospecting' as const,
  probability: '',
  expected_close_date: '',
  assigned_to: '',
});

/**
 * Create (optionally for a fixed lead) or edit an opportunity. The lead cannot
 * change after creation; reassignment is its own action (organization scope).
 */
interface OpportunityFormSheetProps {
  open: boolean;
  onClose: () => void;
  opportunity?: Opportunity | null;
  lead?: LeadRef;
}

export function OpportunityFormSheet(props: OpportunityFormSheetProps) {
  return props.open ? <OpportunityForm key={props.opportunity?.id ?? 'new'} {...props} /> : null;
}

const toValues = (opportunity: Opportunity) => ({
  lead_id: String(opportunity.lead_id),
  title: opportunity.title,
  description: opportunity.description ?? '',
  value: opportunity.value ?? '',
  stage: opportunity.stage,
  probability: opportunity.probability === null ? '' : String(opportunity.probability),
  expected_close_date: toDateInput(opportunity.expected_close_date),
  assigned_to: '',
});

function OpportunityForm({ open, onClose, opportunity, lead }: OpportunityFormSheetProps) {
  const editing = Boolean(opportunity);
  const { canOrg } = useSession();
  const canPickAssignee = !editing && canOrg('crm.opportunities.assign');
  const { create, update } = useOpportunityMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<ComboboxOption | null>(
    lead ? leadOption(lead) : null,
  );
  const form = useZodForm(createOpportunitySchema, {
    defaultValues: opportunity ? toValues(opportunity) : blank(lead?.id),
  });
  const { register, handleSubmit, control, setValue, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;
  const err = (name: string) => errors[name]?.message;

  const saving = create.isPending || update.isPending;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const expected_close_date = toIsoOrNull(values.expected_close_date ?? null);
    try {
      if (opportunity) {
        // The lead is fixed and assignment is a separate action: neither is part of the edit.
        const { title, description, value, stage, probability } = values;
        await update.mutateAsync({
          id: opportunity.id,
          input: { title, description, value, stage, probability, expected_close_date },
        });
        toast.success('Opportunity updated', values.title);
      } else {
        const { assigned_to, ...rest } = values;
        await create.mutateAsync({
          ...rest,
          expected_close_date,
          ...(canPickAssignee && assigned_to != null ? { assigned_to } : {}),
        });
        toast.success('Opportunity created', values.title);
      }
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit opportunity' : 'New opportunity'}
      submitLabel={editing ? 'Save changes' : 'Create opportunity'}
      saving={saving}
      error={formError}
      onSubmit={onSubmit}
    >
      <FormGrid>
        <Field label="Lead" required error={err('lead_id')} className="sm:col-span-2">
          {editing || lead ? (
            <Input readOnly value={opportunity?.lead_name ?? lead?.full_name ?? ''} />
          ) : (
            <Controller
              control={control}
              name="lead_id"
              render={() => (
                <LeadPicker
                  value={selectedLead}
                  onChange={(option) => {
                    setSelectedLead(option);
                    setValue('lead_id', option ? String(option.value) : '', {
                      shouldValidate: true,
                    });
                  }}
                />
              )}
            />
          )}
        </Field>
        <Field label="Title" required error={err('title')} className="sm:col-span-2">
          <Input {...register('title')} />
        </Field>
        <Field label="Stage" error={err('stage')}>
          <Select options={STAGE_OPTIONS} {...register('stage')} />
        </Field>
        <Field label="Value" error={err('value')}>
          <Input type="number" min={0} step="any" {...register('value')} />
        </Field>
        <Field label="Probability (%)" error={err('probability')}>
          <Input type="number" min={0} max={100} {...register('probability')} />
        </Field>
        <Field label="Expected close date" error={err('expected_close_date')}>
          <Input type="date" {...register('expected_close_date')} />
        </Field>
        {canPickAssignee && (
          <Field label="Assigned to" error={err('assigned_to')}>
            <MemberSelect {...register('assigned_to')} />
          </Field>
        )}
        <Field label="Description" error={err('description')} className="sm:col-span-2">
          <Textarea rows={4} {...register('description')} />
        </Field>
      </FormGrid>
    </FormSheet>
  );
}
