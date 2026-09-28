import type { Lead } from '@crm/types';
import type {
  AssignmentInput,
  CreateFollowupInput,
  CreateLeadInput,
  UpdateLeadInput,
} from '@crm/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useQueryKey, useSession } from '../../providers/SessionProvider';

export function useLead(id: number) {
  const key = useQueryKey();
  return useQuery({ queryKey: key('leads', 'detail', id), queryFn: () => api().v1.leads.get(id) });
}

/** Writes refresh leads and what the server derives from them (schedule, customers, reports). */
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

/**
 * UI hint for "may I edit this lead?": organization-wide update, or own scope
 * on a lead assigned to me (or unassigned and created by me). The API remains
 * the authority and answers 403 if this hint is ever wrong.
 */
export function useCanEditLead() {
  const { can, canOrg, user } = useSession();
  return (lead: Pick<Lead, 'assigned_to' | 'created_by'>) =>
    canOrg('crm.leads.update') ||
    (can('crm.leads.update') &&
      (lead.assigned_to === user?.id ||
        (lead.assigned_to === null && lead.created_by === user?.id)));
}
