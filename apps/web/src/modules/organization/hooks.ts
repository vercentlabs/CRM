'use client';

import type { CreateMemberInput, UpdateMemberInput, UpdateProfileInput } from '@crm/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useQueryKey, useSession } from '@/providers/SessionProvider';

/** Members of the active organization (requires settings.users.read). */
export function useMembers(page = 1, limit = 25) {
  const key = useQueryKey();
  const { can } = useSession();
  return useQuery({
    queryKey: key('members', { page, limit }),
    queryFn: () => api().v1.organizations.members({ page, limit }),
    enabled: can('settings.users.read'),
  });
}

/**
 * Active members as assignee options. Empty when the viewer cannot list
 * members; callers only offer assignment with an organization-wide grant.
 */
export function useMemberOptions(enabled = true) {
  const key = useQueryKey();
  const { can } = useSession();
  return useQuery({
    queryKey: key('members', 'options'),
    queryFn: async () => {
      const page = await api().v1.organizations.members({ page: 1, limit: 100 });
      return page.items
        .filter((member) => member.membership_status === 'active')
        .map((member) => ({ value: String(member.id), label: member.full_name }));
    },
    enabled: enabled && can('settings.users.read'),
    staleTime: 5 * 60_000,
  });
}

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
    updateProfile: useMutation({
      mutationFn: ({ userId, input }: { userId: number; input: UpdateProfileInput }) =>
        api().v1.organizations.updateProfile(userId, input),
      onSuccess: invalidate,
    }),
  };
}
