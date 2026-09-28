'use client';

import type { LeadListQuery } from '@crm/api-client';
import type {
  AssignmentInput,
  CreateFollowupInput,
  CreateLeadInput,
  UpdateLeadInput,
} from '@crm/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useQueryKey } from '@/providers/SessionProvider';

export function useLeads(query: LeadListQuery) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('leads', 'list', { ...query }),
    queryFn: () => api().v1.leads.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useLead(id: number) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('leads', 'detail', id),
    queryFn: () => api().v1.leads.get(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}

/**
 * Lead writes. Every write invalidates leads plus what the server derives from
 * them (follow-up schedule, customers on conversion, dashboard counts).
 */
export function useLeadMutations() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all(
      ['leads', 'followups', 'customers', 'reports'].map((scope) =>
        queryClient.invalidateQueries({ queryKey: key(scope) }),
      ),
    );
  return {
    create: useMutation({
      mutationFn: (input: CreateLeadInput) => api().v1.leads.create(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: UpdateLeadInput }) =>
        api().v1.leads.update(id, input),
      onSuccess: invalidate,
    }),
    assign: useMutation({
      mutationFn: ({ id, input }: { id: number; input: AssignmentInput }) =>
        api().v1.leads.assign(id, input),
      onSuccess: invalidate,
    }),
    scheduleFollowup: useMutation({
      mutationFn: ({ id, input }: { id: number; input: CreateFollowupInput }) =>
        api().v1.leads.scheduleFollowup(id, input),
      onSuccess: invalidate,
    }),
  };
}

/** Downloads the leads CSV the viewer may export (own scope: their leads). */
export async function downloadLeadsCsv(): Promise<void> {
  const csv = await api().v1.reports.leadsCsv();
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
