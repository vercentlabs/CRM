import type { Note } from '@crm/types';
import type { CreateNoteInput, UpdateNoteInput } from '@crm/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useQueryKey, useSession } from '../../providers/SessionProvider';

export function useNote(id: number) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('notes', 'detail', id),
    queryFn: () => api().v1.notes.get(id),
    enabled: id > 0,
  });
}

export function useNoteMutations() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key('notes') });
  return {
    create: useMutation({
      mutationFn: (input: CreateNoteInput) => api().v1.notes.create(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: UpdateNoteInput }) =>
        api().v1.notes.update(id, input),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api().v1.notes.remove(id),
      onSuccess: invalidate,
    }),
  };
}

/** Notes are owned by their author (UI hint; the API decides). */
export function useNoteAccess() {
  const { can, canOrg, user } = useSession();
  const mine = (n: Pick<Note, 'created_by'>) => n.created_by === user?.id;
  return {
    canEdit: (n: Pick<Note, 'created_by'>) =>
      canOrg('crm.notes.update') || (can('crm.notes.update') && mine(n)),
    canDelete: (n: Pick<Note, 'created_by'>) =>
      canOrg('crm.notes.delete') || (can('crm.notes.delete') && mine(n)),
  };
}
