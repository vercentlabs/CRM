'use client';

import type { CreateCustomerInput, UpdateCustomerInput } from '@crm/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useQueryKey } from '@/providers/SessionProvider';

export function useCustomers(query: { page: number; limit: number; sort: string }) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('customers', 'list', query),
    queryFn: () => api().v1.customers.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useCustomerMutations() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key('customers') });
  return {
    create: useMutation({
      mutationFn: (input: CreateCustomerInput) => api().v1.customers.create(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: UpdateCustomerInput }) =>
        api().v1.customers.update(id, input),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api().v1.customers.remove(id),
      onSuccess: invalidate,
    }),
  };
}
