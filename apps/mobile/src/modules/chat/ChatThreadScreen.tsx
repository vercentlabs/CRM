import type { ChatMessage } from '@crm/types';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  Sheet,
  Text,
  useToast,
} from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { formatTime } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';
import { useSession } from '../../providers/SessionProvider';
import { useColors } from '../../theme/ThemeProvider';
import { isSafeUrl, useChatMutations, useChatThread, useParticipants } from './hooks';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function ChatThreadScreen({ route }: RootScreenProps<'ChatThread'>) {
  const { id, name } = route.params;
  const { user } = useSession();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const thread = useChatThread(id);
  const participants = useParticipants(id);
  const { send, markRead, upload } = useChatMutations();
  const [text, setText] = useState('');
  const [showPeople, setShowPeople] = useState(false);
  // `mutate` is stable across renders; mark read when the thread opens or grows.
  const { mutate: markAsRead } = markRead;
  const count = thread.data?.length ?? 0;
  useEffect(() => {
    markAsRead(id);
  }, [id, count, markAsRead]);

  const online =
    participants.data?.filter((p) => p.is_online && p.user_id !== user?.id).length ?? 0;
  const busy = send.isPending || upload.isPending;

  const sendText = async () => {
    const content = text.trim();
    if (!content) return;
    try {
      await send.mutateAsync({ id, input: { content, message_type: 'text' } });
      setText('');
    } catch (error) {
      // The draft stays in the box so nothing is lost.
      toast.error('Message not sent', errorMessage(error));
    }
  };

  const attach = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    if (asset.size && asset.size > MAX_UPLOAD_BYTES) {
      toast.error('File too large', 'Attachments can be up to 10 MB.');
      return;
    }
    try {
      const stored = await upload.mutateAsync({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
      });
      await send.mutateAsync({
        id,
        input: {
          content: stored.name,
          message_type: stored.fileType.startsWith('image/') ? 'image' : 'file',
          // The server takes the URL and type from the uploaded file's record.
          file_id: stored.id,
        },
      });
    } catch (error) {
      toast.error('Attachment not sent', errorMessage(error));
    }
  };

  const messages = [...(thread.data ?? [])].reverse();
  return (
    <Screen
      title={name}
      subtitle={online ? `${online} online` : undefined}
      back
      actions={<IconButton icon="users" label="Participants" onPress={() => setShowPeople(true)} />}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={60}
      >
        {thread.isPending ? (
          <LoadingState />
        ) : thread.error ? (
          <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />
        ) : (
          <FlatList
            inverted
            data={messages}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text color="muted" style={styles.empty}>
                No messages yet. Say hello.
              </Text>
            }
            renderItem={({ item }) => <Bubble message={item} mine={item.sender_id === user?.id} />}
          />
        )}
        <View
          style={[
            styles.composer,
            {
              borderTopColor: c.border,
              backgroundColor: c.surface,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <IconButton
            icon="paperclip"
            label="Attach a file"
            onPress={() => void attach()}
            disabled={busy}
          />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={c.muted}
            multiline
            maxLength={10000}
            accessibilityLabel="Message"
            style={[styles.input, { color: c.fg, backgroundColor: c.surfaceMuted }]}
          />
          <IconButton
            icon="send"
            label="Send"
            onPress={() => void sendText()}
            disabled={busy || !text.trim()}
            color={c.primary}
          />
        </View>
      </KeyboardAvoidingView>
      <Sheet visible={showPeople} onClose={() => setShowPeople(false)} title="Participants">
        {(participants.data ?? []).map((p) => (
          <View key={p.user_id} style={styles.person}>
            <Text style={{ flex: 1 }}>{p.full_name ?? p.username ?? `Member ${p.user_id}`}</Text>
            <Text variant="caption" color={p.is_online ? 'success' : 'muted'}>
              {p.is_online ? 'Online' : 'Offline'}
            </Text>
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const c = useColors();
  const url = isSafeUrl(message.attachment_url) ? message.attachment_url : null;
  return (
    <View style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: mine ? c.primary : c.surface, borderColor: c.border },
        ]}
      >
        {!mine ? (
          <Text variant="caption" color="muted">
            {message.sender_name ?? message.sender_username}
          </Text>
        ) : null}
        {url && message.message_type === 'image' ? (
          <Pressable
            onPress={() => void Linking.openURL(url)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Open image ${message.content}`}
          >
            <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
          </Pressable>
        ) : url ? (
          <Pressable onPress={() => void Linking.openURL(url)} accessibilityRole="link">
            <Text
              style={{ color: mine ? c.primaryFg : c.primary, textDecorationLine: 'underline' }}
            >
              📎 {message.content}
            </Text>
          </Pressable>
        ) : (
          <Text style={{ color: mine ? c.primaryFg : c.fg }}>{message.content}</Text>
        )}
        <Text
          variant="caption"
          style={{ color: mine ? c.primaryFg : c.muted, alignSelf: 'flex-end', opacity: 0.8 }}
        >
          {formatTime(message.created_at)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 6 },
  empty: { textAlign: 'center', padding: 24, transform: [{ scaleY: -1 }] },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingHorizontal: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  bubbleRow: { flexDirection: 'row' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    padding: 10,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  image: { width: 200, height: 150, borderRadius: 8 },
  person: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
});
