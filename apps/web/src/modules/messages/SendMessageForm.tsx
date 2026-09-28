'use client';

import type { Lead } from '@crm/types';
import { Alert, Button, Field, Select, Textarea, useToast, type ComboboxOption } from '@crm/ui';
import { sendMessageSchema } from '@crm/validation';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { applyServerErrors, useZodForm } from '@/components/forms/form';
import { LeadPicker, leadOption } from '@/components/forms/pickers';
import { CHANNEL_LABEL, CHANNEL_OPTIONS } from '@/lib/labels';
import { useMessageMutations } from './hooks';

type LeadRef = Pick<Lead, 'id' | 'full_name' | 'mobile_number' | 'email'>;

/**
 * Sends one SMS/WhatsApp message to a lead. The API records it as "Sent";
 * delivery status updates arrive separately (no provider callback in the browser).
 */
export function SendMessageForm({ lead }: { lead?: LeadRef }) {
  const { send } = useMessageMutations();
  const toast = useToast();
  const [selected, setSelected] = useState<ComboboxOption | null>(lead ? leadOption(lead) : null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(sendMessageSchema, {
    defaultValues: { lead_id: lead ? String(lead.id) : '', channel: 'sms', content: '' },
  });
  const { register, handleSubmit, control, setValue, reset, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await send.mutateAsync(values);
      toast.success(`${CHANNEL_LABEL[values.channel]} message sent`, selected?.label);
      reset({ lead_id: lead ? String(lead.id) : '', channel: values.channel, content: '' });
      if (!lead) setSelected(null);
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      {formError && <Alert tone="danger">{formError}</Alert>}
      {!lead && (
        <Field label="Lead" required error={errors.lead_id?.message}>
          <Controller
            control={control}
            name="lead_id"
            render={() => (
              <LeadPicker
                value={selected}
                onChange={(option) => {
                  setSelected(option);
                  setValue('lead_id', option ? String(option.value) : '', { shouldValidate: true });
                }}
              />
            )}
          />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label="Channel" error={errors.channel?.message}>
          <Select options={CHANNEL_OPTIONS} {...register('channel')} />
        </Field>
        <Field label="Message" required error={errors.content?.message}>
          <Textarea rows={3} maxLength={5000} {...register('content')} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={send.isPending}>
          Send message
        </Button>
      </div>
    </form>
  );
}
