import type { Opportunity } from '@crm/types';
import type {
  AssignmentInput,
  CreateOpportunityInput,
  UpdateOpportunityInput,
} from '@crm/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useQueryKey, useSession } from '../../providers/SessionProvider';

export function useOpportunity(id: number) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('opportunities', 'detail', id),
    queryFn: () => api().v1.opportunities.get(id),
    enabled: id > 0,
  });
}

export function useLeadOpportunities(leadId: number) {
  const key = useQueryKey();
  const { can } = useSession();
  return useQuery({
    queryKey: key('opportunities', 'lead', leadId),
    queryFn: () => api().v1.opportunities.list({ lead_id: leadId, limit: 20 }),
    enabled: can('crm.opportunities.read'),
  });
}

export function useOpportunityMutations() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key('opportunities') });
  return {
    create: useMutation({
      mutationFn: (input: CreateOpportunityInput) => api().v1.opportunities.create(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: UpdateOpportunityInput }) =>
        api().v1.opportunities.update(id, input),
      onSuccess: invalidate,
    }),
    assign: useMutation({
      mutationFn: ({ id, input }: { id: number; input: AssignmentInput }) =>
        api().v1.opportunities.assign(id, input),
      onSuccess: invalidate,
    }),
  };
}

/** UI hint mirroring the API ownership rule (assigned to me, or unassigned and created by me). */
export function useCanEditOpportunity() {
  const { can, canOrg, user } = useSession();
  return (o: Pick<Opportunity, 'assigned_to' | 'created_by'>) =>
    canOrg('crm.opportunities.update') ||
    (can('crm.opportunities.update') &&
      (o.assigned_to === user?.id || (o.assigned_to === null && o.created_by === user?.id)));
}
