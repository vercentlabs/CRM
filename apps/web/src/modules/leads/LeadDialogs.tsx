'use client';

import type { Lead, LeadStatus } from '@crm/types';
import { Alert, Badge, Button, Dialog, Field, Input, Select, Textarea, useToast } from '@crm/ui';
import { createFollowupSchema } from '@crm/validation';
import { useId, useState } from 'react';
import { applyServerErrors, useZodForm } from '@/components/forms/form';
import { MemberSelect } from '@/components/forms/pickers';
import { errorMessage } from '@/lib/errors';
import { toIsoOrNull } from '@/lib/format';
import { FOLLOWUP_TYPE_OPTIONS, LEAD_STATUS_TONE } from '@/lib/labels';
import { useLeadMutations } from './hooks';

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={LEAD_STATUS_TONE[status]}>{status}</Badge>;
}

/** Reassign a lead (organization-wide `crm.leads.assign` only; the API enforces it). */
export function AssignLeadDialog({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  return lead ? <AssignLeadForm key={lead.id} lead={lead} onClose={onClose} /> : null;
}

function AssignLeadForm({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { assign } = useLeadMutations();
  const toast = useToast();
  const [value, setValue] = useState(lead.assigned_to === null ? '' : String(lead.assigned_to));
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  const submit = async () => {
    setError(null);
    try {
      const saved = await assign.mutateAsync({
        id: lead.id,
        input: { assigned_to: value === '' ? null : Number(value) },
      });
      toast.success('Lead assigned', saved.assigned_user_name ?? 'Unassigned');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Assign lead"
      description={lead.full_name}
      busy={assign.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={assign.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={assign.isPending}>
            Assign
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}
      <Field label="Assigned to">
        <MemberSelect
          id={fieldId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
    </Dialog>
  );
}

/** Schedule the next follow-up for a lead (also sets the lead's next call). */
type LeadRef = Pick<Lead, 'id' | 'full_name'>;

export function ScheduleFollowupDialog({
  lead,
  onClose,
}: {
  lead: LeadRef | null;
  onClose: () => void;
}) {
  return lead ? <ScheduleFollowupForm key={lead.id} lead={lead} onClose={onClose} /> : null;
}

function ScheduleFollowupForm({ lead, onClose }: { lead: LeadRef; onClose: () => void }) {
  const { scheduleFollowup } = useLeadMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createFollowupSchema, {
    defaultValues: { scheduled_at: '', followup_type: 'Call', notes: '' },
  });
  const { register, handleSubmit, formState } = form;
  const formId = useId();

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await scheduleFollowup.mutateAsync({
        id: lead.id,
        input: { ...values, scheduled_at: toIsoOrNull(values.scheduled_at) ?? values.scheduled_at },
      });
      toast.success('Follow-up scheduled', lead.full_name);
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Schedule follow-up"
      description={lead.full_name}
      busy={scheduleFollowup.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={scheduleFollowup.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={scheduleFollowup.isPending}
          >
            Schedule
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="When" required error={formState.errors.scheduled_at?.message}>
          <Input type="datetime-local" {...register('scheduled_at')} />
        </Field>
        <Field label="Type" error={formState.errors.followup_type?.message}>
          <Select options={FOLLOWUP_TYPE_OPTIONS} {...register('followup_type')} />
        </Field>
        <Field label="Notes" error={formState.errors.notes?.message as string | undefined}>
          <Textarea rows={3} {...register('notes')} />
        </Field>
      </form>
    </Dialog>
  );
}
