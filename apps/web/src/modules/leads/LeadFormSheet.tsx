'use client';

import type { Lead } from '@crm/types';
import { Checkbox, Field, FormGrid, Input, Select, Textarea, useToast } from '@crm/ui';
import { createLeadSchema } from '@crm/validation';
import { useState } from 'react';
import { applyServerErrors, useZodForm } from '@/components/forms/form';
import { FormSheet } from '@/components/forms/FormSheet';
import { MemberSelect } from '@/components/forms/pickers';
import { toDateTimeInput, toIsoOrNull } from '@/lib/format';
import { LEAD_SOURCE_OPTIONS, LEAD_STATUS_OPTIONS } from '@/lib/labels';
import { useSession } from '@/providers/SessionProvider';
import { useLeadMutations } from './hooks';

type FormValues = Record<string, unknown>;

const emptyValues = (): FormValues => ({
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
});

const toValues = (lead: Lead): FormValues => ({
  full_name: lead.full_name,
  mobile_number: lead.mobile_number,
  alternate_number: lead.alternate_number ?? '',
  email: lead.email ?? '',
  source: lead.source ?? '',
  status: lead.status,
  next_call_at: toDateTimeInput(lead.next_call_at),
  age: lead.age === null ? '' : String(lead.age),
  occupation: lead.occupation ?? '',
  monthly_income: lead.monthly_income ?? '',
  address: lead.address ?? '',
  notes: lead.notes ?? '',
  is_aware_of_digital_gold: lead.is_aware_of_digital_gold,
  assigned_to: lead.assigned_to === null ? '' : String(lead.assigned_to),
});

/**
 * Create or edit a lead with the shared `createLeadSchema` rules. Assignment
 * is only offered with an organization-wide assign grant (the API assigns
 * own-scope creators to themselves); on edit it is a separate action.
 */
interface LeadFormSheetProps {
  open: boolean;
  onClose: () => void;
  lead?: Lead | null;
  onSaved?: (lead: Lead) => void;
}

export function LeadFormSheet(props: LeadFormSheetProps) {
  // Mounted only while open, so every opening starts from fresh values.
  return props.open ? <LeadForm key={props.lead?.id ?? 'new'} {...props} /> : null;
}

function LeadForm({ open, onClose, lead, onSaved }: LeadFormSheetProps) {
  const editing = Boolean(lead);
  const { canOrg } = useSession();
  const canPickAssignee = !editing && canOrg('crm.leads.assign');
  const { create, update } = useLeadMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createLeadSchema, {
    defaultValues: lead ? toValues(lead) : emptyValues(),
  });
  const { register, handleSubmit, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  const saving = create.isPending || update.isPending;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { assigned_to, ...rest } = values;
    const body = {
      ...rest,
      next_call_at: toIsoOrNull(values.next_call_at ?? null),
      ...(canPickAssignee && assigned_to != null ? { assigned_to } : {}),
    };
    try {
      const saved = lead
        ? await update.mutateAsync({ id: lead.id, input: body })
        : await create.mutateAsync(body);
      toast.success(lead ? 'Lead updated' : 'Lead created', saved.full_name);
      onSaved?.(saved);
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  const err = (name: string) => errors[name]?.message;

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit lead' : 'New lead'}
      submitLabel={editing ? 'Save changes' : 'Create lead'}
      saving={saving}
      error={formError}
      onSubmit={onSubmit}
    >
      <FormGrid>
        <Field label="Full name" required error={err('full_name')} className="sm:col-span-2">
          <Input autoComplete="off" {...register('full_name')} />
        </Field>
        <Field label="Mobile number" required hint="10 digits" error={err('mobile_number')}>
          <Input inputMode="numeric" {...register('mobile_number')} />
        </Field>
        <Field label="Alternate number" error={err('alternate_number')}>
          <Input inputMode="numeric" {...register('alternate_number')} />
        </Field>
        <Field label="Email" error={err('email')}>
          <Input type="email" {...register('email')} />
        </Field>
        <Field label="Source" error={err('source')}>
          <Select
            placeholder="Not specified"
            options={LEAD_SOURCE_OPTIONS}
            {...register('source')}
          />
        </Field>
        <Field label="Status" error={err('status')}>
          <Select options={LEAD_STATUS_OPTIONS} {...register('status')} />
        </Field>
        <Field label="Next call" error={err('next_call_at')}>
          <Input type="datetime-local" {...register('next_call_at')} />
        </Field>
        {canPickAssignee && (
          <Field label="Assigned to" error={err('assigned_to')}>
            <MemberSelect {...register('assigned_to')} />
          </Field>
        )}
        <Field label="Age" error={err('age')}>
          <Input type="number" min={18} max={100} {...register('age')} />
        </Field>
        <Field label="Occupation" error={err('occupation')}>
          <Input {...register('occupation')} />
        </Field>
        <Field label="Monthly income" error={err('monthly_income')}>
          <Input type="number" min={0} step="any" {...register('monthly_income')} />
        </Field>
        <Field label="Address" error={err('address')} className="sm:col-span-2">
          <Textarea rows={2} {...register('address')} />
        </Field>
        <Field label="Notes" error={err('notes')} className="sm:col-span-2">
          <Textarea rows={3} {...register('notes')} />
        </Field>
        <Checkbox
          className="sm:col-span-2"
          label="Aware of digital gold"
          {...register('is_aware_of_digital_gold')}
        />
      </FormGrid>
    </FormSheet>
  );
}
