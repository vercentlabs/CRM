'use client';

import { ApiClientError } from '@crm/api-client';
import type { ChatMessage, Conversation } from '@crm/types';
import {
  Alert,
  Avatar,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  PaperclipIcon,
  PlusIcon,
  SendIcon,
  Skeleton,
  UsersIcon,
  cn,
  useToast,
} from '@crm/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiErrorState } from '@/components/feedback/QueryState';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatRelative, formatTime } from '@/lib/format';
import { useMemberOptions } from '@/modules/organization/hooks';
import { useSession } from '@/providers/SessionProvider';
import { useChatMutations, useChatThread, useConversations, useParticipants } from './hooks';

const ACCEPT =
  'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,video/mp4,video/mpeg,video/quicktime,.avi,.wmv';
const MAX_BYTES = 10 * 1024 * 1024;
const isSafeUrl = (url: string | null): url is string => Boolean(url && /^https:\/\//.test(url));

/** Internal team chat (participants only; the API hides other conversations). */
export function ChatScreen() {
  const conversations = useConversations();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  // Mark me online while the chat is open (the API owns the stored flag's meaning).
  useEffect(() => {
    void api()
      .v1.chat.setPresence(true)
      .catch(() => undefined);
  }, []);

  const active = conversations.data?.find((c) => c.id === activeId) ?? null;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-96 overflow-hidden rounded-lg border border-border bg-surface">
      <section
        aria-label="Conversations"
        className={cn(
          'flex w-full flex-col border-r border-border md:w-72',
          active && 'hidden md:flex',
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h1 className="text-sm font-semibold">Team chat</h1>
          <IconButton label="New conversation" size="sm" onClick={() => setStarting(true)}>
            <PlusIcon />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.isPending ? (
            <div className="space-y-2 p-3" role="status" aria-label="Loading conversations">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : conversations.error ? (
            <div className="p-3">
              <ApiErrorState
                error={conversations.error}
                onRetry={() => void conversations.refetch()}
              />
            </div>
          ) : conversations.data.length === 0 ? (
            <EmptyState
              className="m-3"
              title="No conversations yet"
              action={<Button onClick={() => setStarting(true)}>Start a conversation</Button>}
            />
          ) : (
            <ul>
              {conversations.data.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    aria-current={c.id === activeId ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-surface-muted',
                      c.id === activeId && 'bg-primary-soft/50',
                    )}
                  >
                    <Avatar name={c.name} decorative />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={cn('truncate text-sm', c.unread_count > 0 && 'font-semibold')}
                        >
                          {c.name}
                        </span>
                        {c.last_message_time && (
                          <span className="shrink-0 text-[11px] text-muted">
                            {formatRelative(c.last_message_time)}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted">
                          {c.last_message ?? 'No messages yet'}
                        </span>
                        {c.unread_count > 0 && (
                          <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-fg">
                            {c.unread_count}
                            <span className="sr-only"> unread</span>
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        aria-label="Messages"
        className={cn('min-w-0 flex-1 flex-col', active ? 'flex' : 'hidden md:flex')}
      >
        {active ? (
          <Thread conversation={active} onBack={() => setActiveId(null)} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              title="Select a conversation"
              description="Or start a new one with a team member."
            />
          </div>
        )}
      </section>

      <NewConversationDialog
        open={starting}
        onClose={() => setStarting(false)}
        onStarted={(id) => {
          setStarting(false);
          setActiveId(id);
        }}
      />
    </div>
  );
}

function Thread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const { user } = useSession();
  const thread = useChatThread(conversation.id);
  const participants = useParticipants(conversation.id);
  const { send, markRead, upload } = useChatMutations();
  const toast = useToast();
  const [text, setText] = useState('');
  const [showPeople, setShowPeople] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const count = thread.data?.length ?? 0;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [count, conversation.id]);

  const { mutate: markConversationRead } = markRead;
  useEffect(() => {
    if (conversation.unread_count > 0) markConversationRead(conversation.id);
  }, [conversation.id, conversation.unread_count, markConversationRead]);

  const submit = () => {
    const content = text.trim();
    if (!content) return;
    send.mutate(
      { id: conversation.id, input: { content, message_type: 'text' } },
      {
        onSuccess: () => setText(''),
        onError: (error) => toast.error('Message not sent', errorMessage(error)),
      },
    );
  };

  const attach = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error('File too large', 'Attachments can be up to 10 MB.');
      return;
    }
    try {
      const stored = await upload.mutateAsync(file);
      await send.mutateAsync({
        id: conversation.id,
        input: {
          content: stored.name,
          message_type: stored.fileType.startsWith('image/') ? 'image' : 'file',
          attachment_url: stored.url,
          file_type: stored.fileType,
        },
      });
    } catch (error) {
      toast.error(
        'Attachment not sent',
        error instanceof ApiClientError && error.status === 413
          ? 'The file is larger than 10 MB.'
          : errorMessage(error),
      );
    }
  };

  const online =
    participants.data?.filter((p) => p.is_online && p.user_id !== user?.id).length ?? 0;

  return (
    <>
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button size="sm" variant="ghost" className="md:hidden" onClick={onBack}>
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{conversation.name}</h2>
          <p className="text-xs text-muted">
            {conversation.participants.length} participants{online > 0 ? ` · ${online} online` : ''}
          </p>
        </div>
        <IconButton label="Participants" size="sm" onClick={() => setShowPeople(true)}>
          <UsersIcon />
        </IconButton>
      </header>

      <div
        className="flex-1 overflow-y-auto px-3 py-3"
        aria-live="polite"
        aria-relevant="additions"
      >
        {thread.isPending ? (
          <div className="space-y-2" role="status" aria-label="Loading messages">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </div>
        ) : thread.error ? (
          <ApiErrorState
            error={thread.error}
            onRetry={() => void thread.refetch()}
            notFoundTitle="Conversation not available"
          />
        ) : thread.data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No messages yet. Say hello.</p>
        ) : (
          <ul className="space-y-2">
            {thread.data.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                mine={message.sender_id === user?.id}
              />
            ))}
          </ul>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border p-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void attach(file);
          }}
        />
        <IconButton
          label="Attach a file"
          onClick={() => fileInput.current?.click()}
          disabled={upload.isPending}
        >
          <PaperclipIcon />
        </IconButton>
        <label className="sr-only" htmlFor="chat-message">
          Message
        </label>
        <textarea
          id="chat-message"
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Write a message (Enter to send, Shift+Enter for a new line)"
          className="max-h-32 min-h-9 flex-1 resize-y rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
        />
        <IconButton
          label="Send message"
          variant="primary"
          type="submit"
          disabled={!text.trim() || send.isPending}
        >
          <SendIcon />
        </IconButton>
      </form>

      <Dialog
        open={showPeople}
        onClose={() => setShowPeople(false)}
        title="Participants"
        description={conversation.name}
      >
        <ul className="divide-y divide-border">
          {(participants.data ?? conversation.participants).map((p) => (
            <li key={p.user_id} className="flex items-center gap-2 py-2 text-sm">
              <Avatar name={p.full_name} decorative />
              <span className="flex-1">{p.full_name ?? p.username}</span>
              <span className={cn('text-xs', p.is_online ? 'text-success' : 'text-muted')}>
                {p.is_online ? 'Online' : 'Offline'}
              </span>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}

function MessageBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const safeUrl = isSafeUrl(message.attachment_url) ? message.attachment_url : null;
  return (
    <li className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2 text-sm',
          mine ? 'bg-primary text-primary-fg' : 'bg-surface-muted text-fg',
        )}
      >
        {!mine && <p className="mb-0.5 text-xs font-medium opacity-80">{message.sender_name}</p>}
        {safeUrl && message.message_type === 'image' ? (
          <a href={safeUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- attachments live on the storage CDN */}
            <img src={safeUrl} alt={message.content} className="max-h-60 rounded" />
          </a>
        ) : safeUrl ? (
          <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="underline">
            📎 {message.content}
          </a>
        ) : (
          <p className="break-words whitespace-pre-wrap">{message.content}</p>
        )}
        <p className="mt-0.5 text-right text-[10px] opacity-70">{formatTime(message.created_at)}</p>
      </div>
    </li>
  );
}

function NewConversationDialog({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  onStarted: (id: number) => void;
}) {
  const { can, user } = useSession();
  const members = useMemberOptions(open && can('settings.users.read'));
  const { start } = useChatMutations();
  const conversations = useConversations(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isGroup = selected.size > 1;

  const options = useMemo(
    () =>
      (members.data ?? [])
        .filter((m) => Number(m.value) !== user?.id)
        .filter((m) => m.label.toLowerCase().includes(filter.toLowerCase())),
    [members.data, user?.id, filter],
  );

  const submit = async () => {
    setError(null);
    try {
      const created = await start.mutateAsync({
        is_group: isGroup,
        participant_ids: [...selected],
        ...(isGroup ? { name } : {}),
      });
      setSelected(new Set());
      setName('');
      onStarted(created.id);
    } catch (err) {
      // A direct conversation with this member already exists: open it.
      const [only] = [...selected];
      const existing =
        err instanceof ApiClientError && err.status === 409 && !isGroup
          ? conversations.data?.find(
              (c) => !c.is_group && c.participants.some((p) => p.user_id === only),
            )
          : undefined;
      if (existing) onStarted(existing.id);
      else setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New conversation"
      busy={start.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={start.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={start.isPending}
            disabled={selected.size === 0 || (isGroup && !name.trim())}
            onClick={() => void submit()}
          >
            Start
          </Button>
        </>
      }
    >
      {!can('settings.users.read') ? (
        <Alert tone="info">
          Your role cannot browse the member directory, so you cannot start new conversations. Ask a
          manager to add you to one.
        </Alert>
      ) : (
        <div className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <Input
            type="search"
            aria-label="Find a member"
            placeholder="Find a member"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <fieldset className="max-h-60 space-y-1.5 overflow-y-auto">
            <legend className="sr-only">Participants</legend>
            {members.isPending && <Skeleton className="h-8" />}
            {options.map((member) => (
              <Checkbox
                key={member.value}
                label={member.label}
                checked={selected.has(Number(member.value))}
                onChange={(event) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(Number(member.value));
                    else next.delete(Number(member.value));
                    return next;
                  })
                }
              />
            ))}
          </fieldset>
          {isGroup && (
            <Field label="Group name" required>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
          )}
        </div>
      )}
    </Dialog>
  );
}
