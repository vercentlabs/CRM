import { sendMessageSchema } from '@crm/validation';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { applyServerErrors, FormText, useZodForm } from '../../components/forms/form';
import { FormActions, FormError } from '../../components/forms/pickers';
import { Segmented, Sheet, useToast } from '../../components/ui';
import { CHANNEL_LABEL, CHANNEL_OPTIONS } from '../../lib/labels';
import { useMessageMutations } from './hooks';

/**
 * Sends one SMS/WhatsApp message to a lead. The API records it as "Sent";
 * delivery updates arrive separately.
 */
export function SendMessageSheet({
  lead,
  onClose,
}: {
  lead: { id: number; full_name: string } | null;
  onClose: () => void;
}) {
  return lead ? <SendForm key={lead.id} lead={lead} onClose={onClose} /> : null;
}

function SendForm({
  lead,
  onClose,
}: {
  lead: { id: number; full_name: string };
  onClose: () => void;
}) {
  const { send } = useMessageMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(sendMessageSchema, {
    defaultValues: { lead_id: String(lead.id), channel: 'sms', content: '' },
  });
  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await send.mutateAsync(values);
      toast.success(`${CHANNEL_LABEL[values.channel]} message sent`, lead.full_name);
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Send message"
      subtitle={lead.full_name}
      busy={send.isPending}
    >
      <FormError message={formError} />
      <Controller
        control={form.control}
        name="channel"
        render={({ field }) => (
          <Segmented
            label="Channel"
            options={CHANNEL_OPTIONS}
            value={field.value as 'sms' | 'whatsapp'}
            onChange={field.onChange}
          />
        )}
      />
      <FormText
        control={form.control}
        name="content"
        label="Message"
        required
        multiline
        maxLength={5000}
      />
      <FormActions
        submitLabel="Send"
        saving={send.isPending}
        onSubmit={() => void submit()}
        onCancel={onClose}
      />
    </Sheet>
  );
}
