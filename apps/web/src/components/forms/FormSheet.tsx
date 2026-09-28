'use client';

import { Alert, Button, Sheet } from '@crm/ui';
import { useId, type FormEventHandler, type ReactNode } from 'react';

/**
 * Side-sheet form: labelled form, error summary, Cancel + Submit footer.
 * Submit is disabled while saving (duplicate-submit prevention).
 */
export function FormSheet({
  open,
  onClose,
  title,
  description,
  onSubmit,
  submitLabel,
  saving,
  error,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  submitLabel: string;
  saving: boolean;
  error?: string | null | undefined;
  children: ReactNode;
}) {
  const formId = useId();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      busy={saving}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {children}
      </form>
    </Sheet>
  );
}
