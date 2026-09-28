import type { Task } from '@crm/types';
import { createTaskSchema } from '@crm/validation';
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
import { FormActions, FormError, MemberSelect } from '../../components/forms/pickers';
import {
  Button,
  confirm,
  ErrorState,
  LoadingState,
  Screen,
  Section,
  Text,
  useToast,
} from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '../../lib/labels';
import type { RootScreenProps } from '../../navigation/types';
import { useTask, useTaskAccess, useTaskMutations } from './hooks';

export function TaskFormScreen({ route }: RootScreenProps<'TaskForm'>) {
  const id = route.params?.id;
  const task = useTask(id ?? 0);
  if (id === undefined) return <TaskForm due={route.params?.due} />;
  if (task.isPending)
    return (
      <Screen title="Task" back>
        <LoadingState />
      </Screen>
    );
  if (task.error) {
    return (
      <Screen title="Task" back>
        <ErrorState error={task.error} onRetry={() => void task.refetch()} />
      </Screen>
    );
  }
  return <TaskForm task={task.data} />;
}

/** Tasks back the calendar too: an event is a task with a due date. */
function TaskForm({ task, due }: { task?: Task; due?: string | undefined }) {
  const navigation = useNavigation();
  const access = useTaskAccess();
  const editable = !task || access.canEdit(task);
  const { create, update, remove } = useTaskMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createTaskSchema, {
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      due_date: task?.due_date ?? due ?? '',
      priority: task?.priority ?? 'medium',
      status: task?.status ?? 'pending',
      assigned_to: task?.assigned_to == null ? '' : String(task.assigned_to),
    },
  });
  const { control, handleSubmit } = form;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const { assigned_to, ...rest } = values;
    const body = {
      ...rest,
      ...(access.canPickAssignee ? { assigned_to: assigned_to ?? null } : {}),
    };
    try {
      if (task) await update.mutateAsync({ id: task.id, input: body });
      else await create.mutateAsync(body);
      toast.success(task ? 'Task updated' : 'Task created', rest.title);
      navigation.goBack();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  const onDelete = () => {
    if (!task) return;
    confirm({
      title: 'Delete task?',
      message: `"${task.title}" will be removed from tasks and the calendar.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await remove.mutateAsync(task.id);
          toast.success('Task deleted', task.title);
          navigation.goBack();
        } catch (error) {
          toast.error('Could not delete task', errorMessage(error));
        }
      },
    });
  };

  return (
    <Screen title={task ? (editable ? 'Edit task' : 'Task') : 'New task'} back scroll keyboard>
      <FormError message={formError} />
      {!access.canPickAssignee && !task ? (
        <Text variant="caption" color="muted">
          Tasks you create are assigned to you.
        </Text>
      ) : null}
      <Section title="Task">
        <FormText control={control} name="title" label="Title" required editable={editable} />
        <FormText
          control={control}
          name="description"
          label="Description"
          multiline
          editable={editable}
        />
        <FormDate control={control} name="due_date" label="Due" required />
        <FormSelect
          control={control}
          name="priority"
          label="Priority"
          options={TASK_PRIORITY_OPTIONS}
        />
        <FormSelect control={control} name="status" label="Status" options={TASK_STATUS_OPTIONS} />
        {access.canPickAssignee ? (
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
          submitLabel={task ? 'Save changes' : 'Create task'}
          saving={create.isPending || update.isPending}
          onSubmit={() => void submit()}
          onCancel={() => navigation.goBack()}
        />
      ) : null}
      {task && access.canDelete(task) ? (
        <Button
          label="Delete task"
          variant="danger"
          icon="trash-2"
          onPress={onDelete}
          loading={remove.isPending}
        />
      ) : null}
    </Screen>
  );
}
