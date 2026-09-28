import { ApiClientError } from '@crm/api-client';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { FormActions, FormError, useMemberOptions } from '../../components/forms/pickers';
import { ListRow } from '../../components/lists/PagedList';
import {
  Avatar,
  Badge,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  Sheet,
  SwitchField,
  Text,
  TextField,
} from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatRelative } from '../../lib/format';
import { useSession } from '../../providers/SessionProvider';
import { useChatMutations, useConversations } from './hooks';

export function ChatScreen() {
  const navigation = useNavigation();
  const { can, user } = useSession();
  const conversations = useConversations();
  const [creating, setCreating] = useState(false);
  const canStart = can('settings.users.read');

  // Presence: online while the chat is open (best effort; cleared on sign-out).
  useEffect(() => {
    void api()
      .v1.chat.setPresence(true)
      .catch(() => undefined);
  }, []);

  const open = (id: number, name: string) => navigation.navigate('ChatThread', { id, name });

  return (
    <Screen
      title="Team chat"
      actions={
        canStart ? (
          <IconButton icon="edit" label="New conversation" onPress={() => setCreating(true)} />
        ) : null
      }
    >
      {conversations.isPending ? (
        <LoadingState />
      ) : conversations.error ? (
        <ErrorState error={conversations.error} onRetry={() => void conversations.refetch()} />
      ) : (
        <FlatList
          data={conversations.data}
          keyExtractor={(c) => String(c.id)}
          refreshControl={
            <RefreshControl
              refreshing={conversations.isRefetching}
              onRefresh={() => void conversations.refetch()}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="message-circle"
              title="No conversations yet"
              message={canStart ? 'Start one with a teammate.' : undefined}
            />
          }
          renderItem={({ item }) => {
            const others = item.participants.filter((p) => p.user_id !== user?.id);
            const name = item.is_group ? item.name : (others[0]?.full_name ?? item.name);
            const online = !item.is_group && others[0]?.is_online;
            return (
              <ListRow
                leading={<Avatar name={name} />}
                title={name}
                subtitle={
                  item.last_message
                    ? `${item.last_message_sender_id === user?.id ? 'You: ' : ''}${item.last_message}`
                    : 'No messages yet'
                }
                meta={[
                  item.last_message_time ? formatRelative(item.last_message_time) : null,
                  online ? 'Online' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => open(item.id, name)}
                trailing={
                  item.unread_count > 0 ? (
                    <Badge label={`${item.unread_count} unread`} tone="danger" />
                  ) : undefined
                }
              />
            );
          }}
        />
      )}
      {creating ? (
        <NewConversationSheet
          onClose={() => setCreating(false)}
          onStarted={(id, name) => {
            setCreating(false);
            open(id, name);
          }}
        />
      ) : null}
    </Screen>
  );
}

function NewConversationSheet({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: (id: number, name: string) => void;
}) {
  const { user } = useSession();
  const members = useMemberOptions();
  const conversations = useConversations(false);
  const { start } = useChatMutations();
  const [isGroup, setIsGroup] = useState(false);
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const options = (members.data ?? []).filter(
    (m) => Number(m.value) !== user?.id && m.label.toLowerCase().includes(filter.toLowerCase()),
  );

  const toggle = (id: number) => {
    const next = new Set(isGroup ? selected : []);
    if (selected.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const submit = async () => {
    setError(null);
    const [only] = [...selected];
    const label = isGroup
      ? name
      : (members.data?.find((m) => Number(m.value) === only)?.label ?? 'Conversation');
    try {
      const created = await start.mutateAsync({
        is_group: isGroup,
        participant_ids: [...selected],
        ...(isGroup ? { name } : {}),
      });
      onStarted(created.id, isGroup ? created.name : label);
    } catch (err) {
      // A direct conversation with this member already exists: open it.
      const existing =
        err instanceof ApiClientError && err.status === 409 && !isGroup
          ? conversations.data?.find(
              (c) => !c.is_group && c.participants.some((p) => p.user_id === only),
            )
          : undefined;
      if (existing) onStarted(existing.id, label);
      else setError(errorMessage(err));
    }
  };

  return (
    <Sheet visible onClose={onClose} title="New conversation" busy={start.isPending}>
      <FormError message={error} />
      <SwitchField
        label="Group conversation"
        value={isGroup}
        onChange={(v) => {
          setIsGroup(v);
          setSelected(new Set());
        }}
      />
      {isGroup ? (
        <TextField label="Group name" required value={name} onChangeText={setName} />
      ) : null}
      <TextField
        label="Find a teammate"
        value={filter}
        onChangeText={setFilter}
        autoCapitalize="none"
      />
      {members.isPending ? <LoadingState /> : null}
      <View style={styles.people}>
        {options.map((m) => (
          <Chip
            key={m.value}
            label={m.label}
            selected={selected.has(Number(m.value))}
            onPress={() => toggle(Number(m.value))}
          />
        ))}
        {!members.isPending && options.length === 0 ? (
          <Text color="muted">No teammates found.</Text>
        ) : null}
      </View>
      <FormActions
        submitLabel={isGroup ? 'Create group' : 'Start chat'}
        saving={start.isPending}
        onSubmit={() => {
          if (selected.size === 0) setError('Choose at least one teammate.');
          else if (isGroup && !name.trim()) setError('Group name is required.');
          else void submit();
        }}
        onCancel={onClose}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({ people: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 } });
