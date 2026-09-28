'use client';

import type { TaskStatus } from '@crm/types';
import type { CreateTaskInput, UpdateTaskInput } from '@crm/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useQueryKey } from '@/providers/SessionProvider';

export interface TaskQuery {
  page: number;
  limit: number;
  sort?: string;
  status?: TaskStatus;
  due_from?: string;
  due_to?: string;
}

export function useTasks(query: TaskQuery, enabled = true) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('tasks', 'list', { ...query }),
    queryFn: () => api().v1.tasks.list(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Calendar events are the task store seen through /calendar/events (no separate model). */
export function useCalendarEvents(range: { from: string; to: string }) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('tasks', 'calendar', range),
    queryFn: () => api().v1.calendar.events(range),
    placeholderData: keepPreviousData,
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
