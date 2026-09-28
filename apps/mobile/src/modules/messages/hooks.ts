import type { LeadMessage } from '@crm/types';
import type { BulkMessageInput, SendMessageInput } from '@crm/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useQueryKey, useSession } from '../../providers/SessionProvider';

export function useLeadMessages(leadId: number) {
  const key = useQueryKey();
  const { can } = useSession();
  return useQuery({
    queryKey: key('messages', 'lead', leadId),
    queryFn: () => api().v1.messages.list({ lead_id: leadId, limit: 10 }),
    enabled: can('crm.messages.read'),
  });
}

export function useMessageMutations() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all(
      ['messages', 'reports'].map((s) => queryClient.invalidateQueries({ queryKey: key(s) })),
    );
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

/** Readable channel for a stored message type. */
export const channelLabel = (type: LeadMessage['message_type']) => (type === 'SMS' ? 'SMS' : type);
