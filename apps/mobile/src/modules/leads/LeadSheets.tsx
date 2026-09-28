import type { Lead } from '@crm/types';
import { createFollowupSchema } from '@crm/validation';
import { useState } from 'react';
import {
  applyServerErrors,
  FormDate,
  FormSelect,
  FormText,
  useZodForm,
} from '../../components/forms/form';
import { FormActions, FormError, MemberSelect } from '../../components/forms/pickers';
import { Sheet, useToast } from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { FOLLOWUP_TYPE_OPTIONS } from '../../lib/labels';
import { useLeadMutations } from './hooks';

type LeadRef = Pick<Lead, 'id' | 'full_name'>;

/** Reassign (organization-wide crm.leads.assign; the API enforces it). */
export function AssignSheet({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  return lead ? <AssignForm key={lead.id} lead={lead} onClose={onClose} /> : null;
}

function AssignForm({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { assign } = useLeadMutations();
  const toast = useToast();
  const [value, setValue] = useState<string | null>(
    lead.assigned_to === null ? null : String(lead.assigned_to),
  );
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      const saved = await assign.mutateAsync({
        id: lead.id,
        input: { assigned_to: value === null ? null : Number(value) },
      });
      toast.success('Lead assigned', saved.assigned_user_name ?? 'Unassigned');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Assign lead"
      subtitle={lead.full_name}
      busy={assign.isPending}
    >
      <FormError message={error} />
      <MemberSelect value={value} onChange={setValue} />
      <FormActions
        submitLabel="Assign"
        saving={assign.isPending}
        onSubmit={() => void submit()}
        onCancel={onClose}
      />
    </Sheet>
  );
}

/** Schedule the next follow-up (also sets the lead's next call). */
export function ScheduleFollowupSheet({
  lead,
  onClose,
}: {
  lead: LeadRef | null;
  onClose: () => void;
}) {
  return lead ? <ScheduleForm key={lead.id} lead={lead} onClose={onClose} /> : null;
}

function ScheduleForm({ lead, onClose }: { lead: LeadRef; onClose: () => void }) {
  const { scheduleFollowup } = useLeadMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createFollowupSchema, {
    defaultValues: { scheduled_at: '', followup_type: 'Call', notes: '' },
  });
  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await scheduleFollowup.mutateAsync({ id: lead.id, input: values });
      toast.success('Follow-up scheduled', lead.full_name);
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Schedule follow-up"
      subtitle={lead.full_name}
      busy={scheduleFollowup.isPending}
    >
      <FormError message={formError} />
      <FormDate control={form.control} name="scheduled_at" label="When" required />
      <FormSelect
        control={form.control}
        name="followup_type"
        label="Type"
        options={FOLLOWUP_TYPE_OPTIONS}
      />
      <FormText control={form.control} name="notes" label="Notes" multiline />
      <FormActions
        submitLabel="Schedule"
        saving={scheduleFollowup.isPending}
        onSubmit={() => void submit()}
        onCancel={onClose}
      />
    </Sheet>
  );
}
