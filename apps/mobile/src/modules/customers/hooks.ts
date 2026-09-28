import type { Customer } from '@crm/types';
import type { CreateCustomerInput, UpdateCustomerInput } from '@crm/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useQueryKey, useSession } from '../../providers/SessionProvider';

export function useCustomer(id: number) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('customers', 'detail', id),
    queryFn: () => api().v1.customers.get(id),
    enabled: id > 0,
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

/** Customers are owned by their assignee (UI hint; the API decides). */
export function useCustomerAccess() {
  const { can, canOrg, user } = useSession();
  const owns = (c: Pick<Customer, 'assigned_to'>) => c.assigned_to === user?.id;
  return {
    canEdit: (c: Pick<Customer, 'assigned_to'>) =>
      canOrg('crm.customers.update') || (can('crm.customers.update') && owns(c)),
    canDelete: (c: Pick<Customer, 'assigned_to'>) =>
      canOrg('crm.customers.delete') || (can('crm.customers.delete') && owns(c)),
  };
}
