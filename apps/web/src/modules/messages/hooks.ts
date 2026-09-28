'use client';

import type { BulkMessageInput, SendMessageInput } from '@crm/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useQueryKey } from '@/providers/SessionProvider';

export function useLeadMessages(
  query: { page?: number; limit?: number; lead_id?: number },
  enabled = true,
) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('messages', 'list', query),
    queryFn: () => api().v1.messages.list(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useMessageMutations() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key('messages') }),
      queryClient.invalidateQueries({ queryKey: key('reports') }),
    ]);
  return {
    send: useMutation({
      mutationFn: (input: SendMessageInput) => api().v1.messages.send(input),
      onSuccess: invalidate,
    }),
    sendBulk: useMutation({
      mutationFn: (input: BulkMessageInput) => api().v1.messages.sendBulk(input),
      onSuccess: invalidate,
    }),
  };
}
