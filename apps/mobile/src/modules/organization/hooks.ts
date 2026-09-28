import type { CreateMemberInput, UpdateMemberInput } from '@crm/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useQueryKey, useSession } from '../../providers/SessionProvider';

export function useRoles() {
  const key = useQueryKey();
  const { can } = useSession();
  return useQuery({
    queryKey: key('roles'),
    queryFn: () => api().v1.organizations.roles(),
    enabled: can('settings.users.read'),
    staleTime: 5 * 60_000,
  });
}

export function useMemberMutations() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key('members') });
  return {
    add: useMutation({
      mutationFn: (input: CreateMemberInput) => api().v1.organizations.addMember(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ userId, input }: { userId: number; input: UpdateMemberInput }) =>
        api().v1.organizations.updateMember(userId, input),
      onSuccess: invalidate,
    }),
  };
}
