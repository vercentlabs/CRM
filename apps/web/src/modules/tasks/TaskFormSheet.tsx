'use client';

import type { Task } from '@crm/types';
import { Field, FormGrid, Input, Select, Textarea, useToast } from '@crm/ui';
import { createTaskSchema } from '@crm/validation';
import { useState } from 'react';
import { applyServerErrors, useZodForm } from '@/components/forms/form';
import { FormSheet } from '@/components/forms/FormSheet';
import { MemberSelect } from '@/components/forms/pickers';
import { toDateTimeInput, toIsoOrNull } from '@/lib/format';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@/lib/labels';
import { useSession } from '@/providers/SessionProvider';
import { useTaskMutations } from './hooks';

/**
 * Create/edit a task (also used by the calendar: an event is a task).
 * `defaultDue` prefills the due date (e.g. the calendar day that was clicked).
 */
interface TaskFormSheetProps {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  defaultDue?: string | undefined;
}

export function TaskFormSheet(props: TaskFormSheetProps) {
  return props.open ? (
    <TaskForm key={props.task?.id ?? `new-${props.defaultDue ?? ''}`} {...props} />
  ) : null;
}

function TaskForm({ open, onClose, task, defaultDue }: TaskFormSheetProps) {
  const { canOrg } = useSession();
  const canPickAssignee = canOrg('crm.tasks.create') && canOrg('crm.tasks.update');
  const { create, update } = useTaskMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createTaskSchema, {
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      due_date: task ? toDateTimeInput(task.due_date) : (defaultDue ?? ''),
      priority: task?.priority ?? 'medium',
      status: task?.status ?? 'pending',
      assigned_to: task?.assigned_to == null ? '' : String(task.assigned_to),
    },
  });
  const { register, handleSubmit, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { assigned_to, ...rest } = values;
    const body = {
      ...rest,
      due_date: toIsoOrNull(values.due_date) ?? values.due_date,
      ...(canPickAssignee ? { assigned_to: assigned_to ?? null } : {}),
    };
    try {
      if (task) await update.mutateAsync({ id: task.id, input: body });
      else await create.mutateAsync(body);
      toast.success(task ? 'Task updated' : 'Task created', values.title);
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={task ? 'Edit task' : 'New task'}
      description={canPickAssignee ? undefined : 'Tasks you create are assigned to you.'}
      submitLabel={task ? 'Save changes' : 'Create task'}
      saving={create.isPending || update.isPending}
      error={formError}
      onSubmit={onSubmit}
    >
      <FormGrid>
        <Field label="Title" required error={errors.title?.message} className="sm:col-span-2">
          <Input {...register('title')} />
        </Field>
        <Field label="Due" required error={errors.due_date?.message}>
          <Input type="datetime-local" {...register('due_date')} />
        </Field>
        <Field label="Priority" error={errors.priority?.message}>
          <Select options={TASK_PRIORITY_OPTIONS} {...register('priority')} />
        </Field>
        <Field label="Status" error={errors.status?.message}>
          <Select options={TASK_STATUS_OPTIONS} {...register('status')} />
        </Field>
        {canPickAssignee && (
          <Field label="Assigned to" error={errors.assigned_to?.message}>
            <MemberSelect {...register('assigned_to')} />
          </Field>
        )}
        <Field label="Description" error={errors.description?.message} className="sm:col-span-2">
          <Textarea rows={4} {...register('description')} />
        </Field>
      </FormGrid>
    </FormSheet>
  );
}
