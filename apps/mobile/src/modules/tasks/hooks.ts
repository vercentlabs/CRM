import type { Task } from '@crm/types';
import type { CreateTaskInput, UpdateTaskInput } from '@crm/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useQueryKey, useSession } from '../../providers/SessionProvider';

export function useTask(id: number) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('tasks', 'detail', id),
    queryFn: () => api().v1.tasks.get(id),
    enabled: id > 0,
  });
}

/** Calendar events are the task store seen through /calendar/events (no separate model). */
export function useCalendarEvents(range: { from: string; to: string }) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('tasks', 'calendar', range),
    queryFn: () => api().v1.calendar.events(range),
  });
}

export function useTaskMutations() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  // Tasks and calendar events share one cache prefix: any write refreshes both.
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key('tasks') }),
      queryClient.invalidateQueries({ queryKey: key('dashboard') }),
    ]);
  return {
    create: useMutation({
      mutationFn: (input: CreateTaskInput) => api().v1.tasks.create(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: UpdateTaskInput }) =>
        api().v1.tasks.update(id, input),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api().v1.tasks.remove(id),
      onSuccess: invalidate,
    }),
  };
}

/** Tasks are owned by their assignee (UI hint; the API decides). */
export function useTaskAccess() {
  const { can, canOrg, user } = useSession();
  const owns = (t: Pick<Task, 'assigned_to'>) => t.assigned_to === user?.id;
  return {
    canEdit: (t: Pick<Task, 'assigned_to'>) =>
      canOrg('crm.tasks.update') || (can('crm.tasks.update') && owns(t)),
    canDelete: (t: Pick<Task, 'assigned_to'>) =>
      canOrg('crm.tasks.delete') || (can('crm.tasks.delete') && owns(t)),
    canPickAssignee: canOrg('crm.tasks.create') && canOrg('crm.tasks.update'),
  };
}
