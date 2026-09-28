'use client';

import type { PageQuery } from '@crm/api-client';
import type { OpportunityStage } from '@crm/types';
import type {
  AssignmentInput,
  CreateOpportunityInput,
  UpdateOpportunityInput,
} from '@crm/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useQueryKey } from '@/providers/SessionProvider';

export type OpportunityQuery = PageQuery & {
  stage?: OpportunityStage;
  lead_id?: number;
  sort?: string;
};

export function useOpportunities(query: OpportunityQuery) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('opportunities', 'list', { ...query }),
    queryFn: () => api().v1.opportunities.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useOpportunity(id: number | null) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('opportunities', 'detail', id),
    queryFn: () => api().v1.opportunities.get(id!),
    enabled: id !== null && id > 0,
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
