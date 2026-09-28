import type { CreateConversationInput, SendChatMessageInput } from '@crm/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useQueryKey, useSession } from '../../providers/SessionProvider';

/** Chat has no push channel yet: lists and open threads are polled. */
const LIST_POLL_MS = 15_000;
const THREAD_POLL_MS = 5_000;

export function useConversations(poll = true) {
  const key = useQueryKey();
  const { can } = useSession();
  return useQuery({
    queryKey: key('chat', 'conversations'),
    queryFn: () => api().v1.chat.conversations(),
    enabled: can('crm.chat.use'),
    refetchInterval: poll ? LIST_POLL_MS : false,
  });
}

/** Total unread messages for the navigation badge. */
export function useChatUnread(): number {
  const conversations = useConversations();
  return (conversations.data ?? []).reduce((sum, c) => sum + c.unread_count, 0);
}

export function useChatThread(conversationId: number) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('chat', 'messages', conversationId),
    queryFn: () => api().v1.chat.messages(conversationId),
    refetchInterval: THREAD_POLL_MS,
  });
}

export function useParticipants(conversationId: number) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('chat', 'participants', conversationId),
    queryFn: () => api().v1.chat.participants(conversationId),
    refetchInterval: LIST_POLL_MS,
  });
}

/** A picked device file, uploaded through the shared client (bearer auth, org-scoped storage). */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

export function useChatMutations() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key('chat') });
  return {
    start: useMutation({
      mutationFn: (input: CreateConversationInput) => api().v1.chat.start(input),
      onSuccess: invalidate,
    }),
    send: useMutation({
      mutationFn: ({ id, input }: { id: number; input: SendChatMessageInput }) =>
        api().v1.chat.send(id, input),
      onSuccess: invalidate,
    }),
    markRead: useMutation({
      mutationFn: (id: number) => api().v1.chat.markRead(id),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: key('chat', 'conversations') }),
    }),
    upload: useMutation({
      // React Native's FormData streams a { uri, name, type } part from disk.
      mutationFn: (file: PickedFile) =>
        api().v1.files.uploadChatAttachment({
          uri: file.uri,
          name: file.name,
          type: file.mimeType,
        } as unknown as Blob),
    }),
  };
}

/** Only http(s) attachment links are opened. */
export const isSafeUrl = (url: string | null | undefined): url is string =>
  Boolean(url && /^https?:\/\//i.test(url));
