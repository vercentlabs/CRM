import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  Keyboard
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { ErrorState, LoadingState } from '../components/ui';

type ChatParticipant = {
  user_id: number;
  full_name?: string | null;
  username?: string | null;
  role_id?: number | null;
  is_online?: boolean | null;
  last_read_at?: string | null;
};

type Conversation = {
  id: number;
  name: string;
  is_group: boolean;
  participants: ChatParticipant[];
  last_message?: string | null;
  last_message_time?: string | null;
  unread_count?: number | null;
};

type ChatMessage = {
  id: number;
  sender_id: number;
  sender_name?: string | null;
  sender_username?: string | null;
  content: string;
  created_at: string;
  message_type?: string | null;
  attachment_url?: string | null;
  file_type?: string | null;
};

type AttachmentState = {
  name: string;
  uri: string;
  mimeType?: string | null;
  url?: string | null;
  fileType?: string | null;
};

const ChatScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<number, ChatMessage[]>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [showParticipants, setShowParticipants] = useState(false);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [attachment, setAttachment] = useState<AttachmentState | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const getConversationTitle = useCallback(
    (conv: Conversation) => {
      if (conv.is_group) return conv.name || 'Group';
      const other = conv.participants?.find((participant) => participant.user_id !== user?.id);
      return other?.full_name || other?.username || conv.name || 'Direct Chat';
    },
    [user?.id]
  );

  const loadConversations = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await apiRequest<{ conversations?: Conversation[] }>('/api/chat/conversations');
      setConversations(data.conversations || []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load conversations.');
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  const loadMessages = useCallback(
    async (conversationId: number) => {
      setLoadingMessages(true);
      try {
        const data = await apiRequest<{ messages?: ChatMessage[] }>(
          `/api/chat/conversations/${conversationId}/messages`
        );
        setMessagesByConversation((prev) => ({
          ...prev,
          [conversationId]: data.messages || []
        }));
        await apiRequest(`/api/chat/conversations/${conversationId}/read`, { method: 'PUT' });
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError.message || 'Failed to load messages.');
      } finally {
        setLoadingMessages(false);
      }
    },
    []
  );

  const loadParticipants = useCallback(async (conversationId: number) => {
    setParticipantsLoading(true);
    try {
      const data = await apiRequest<{ participants?: ChatParticipant[] }>(
        `/api/chat/conversations/${conversationId}/participants`
      );
      setParticipants(data.participants || []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load participants.');
    } finally {
      setParticipantsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadConversations({ silent: true });
    }, 20000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    const updateStatus = async (isOnline: boolean) => {
      try {
        await apiRequest('/api/chat/online-status', { method: 'PUT', body: { isOnline } });
      } catch (err) {
        // ignore
      }
    };

    void updateStatus(true);

    return () => {
      void updateStatus(false);
    };
  }, []);

  useEffect(() => {
    if (activeId) {
      void loadMessages(activeId);
    }
  }, [activeId, loadMessages]);

  const activeConversation = useMemo(
    () => conversations.find((conv) => conv.id === activeId) || null,
    [activeId, conversations]
  );
  const activeTitle = activeConversation ? getConversationTitle(activeConversation) : '';

  const messages = activeId ? messagesByConversation[activeId] || [] : [];
  const messagesPaddingBottom =
    Platform.OS === 'android' && keyboardVisible
      ? keyboardHeight + 58
      : 16;
  const sendDisabled = uploadingAttachment || (!draft.trim() && !attachment);

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations;
    const term = search.toLowerCase();
    return conversations.filter(
      (conv) => {
        const title = getConversationTitle(conv).toLowerCase();
        return (
          title.includes(term) || (conv.last_message || '').toLowerCase().includes(term)
        );
      }
    );
  }, [conversations, getConversationTitle, search]);

  const orderedConversations = useMemo(() => {
    const teamIndex = filteredConversations.findIndex(
      (conv) => getConversationTitle(conv).toLowerCase() === 'team'
    );
    if (teamIndex === -1) return filteredConversations;
    const team = filteredConversations[teamIndex];
    const rest = filteredConversations.filter((_, index) => index !== teamIndex);
    return [team, ...rest];
  }, [filteredConversations, getConversationTitle]);

  const formatTime = (value?: string | null) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getConversationOnline = (conv: Conversation) => {
    const others = conv.participants?.filter((p) => p.user_id !== user?.id) || [];
    return others.some((participant) => participant.is_online);
  };

  const handleSend = async () => {
    if (!activeId) return;
    if (!draft.trim() && !attachment) return;
    const content = draft.trim();
    setSendError(null);

    try {
      const data = await apiRequest<ChatMessage>(
        `/api/chat/conversations/${activeId}/messages`,
        {
          method: 'POST',
          body: {
            content: content || (attachment ? 'Shared a file' : ''),
            messageType: attachment ? 'file' : 'text',
            attachmentUrl: attachment?.url || null,
            fileType: attachment?.fileType || null
          }
        }
      );
      if (data) {
        setMessagesByConversation((prev) => ({
          ...prev,
          [activeId]: [...(prev[activeId] || []), data]
        }));
      } else {
        await loadMessages(activeId);
      }
      await loadConversations();
      setAttachment(null);
      setDraft('');
    } catch (err) {
      const apiError = err as ApiError;
      setSendError(apiError.message || 'Failed to send message.');
    }
  };

  const handleOpenParticipants = () => {
    if (!activeId) return;
    setShowParticipants(true);
    void loadParticipants(activeId);
  };

  const handlePickAttachment = async () => {
    try {
      setError(null);
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      if (asset.size && asset.size > 10 * 1024 * 1024) {
        setError('File size exceeds 10MB limit.');
        return;
      }

      setUploadingAttachment(true);
      const formData = new FormData();
      formData.append(
        'file',
        {
          uri: asset.uri,
          name: asset.name || 'attachment',
          type: asset.mimeType || 'application/octet-stream'
        } as unknown as Blob
      );

      const upload = await apiRequest<{
        url?: string;
        fileType?: string;
        name?: string;
      }>('/api/upload/chat-attachment', {
        method: 'POST',
        body: formData
      });

      setAttachment({
        name: upload?.name || asset.name || 'Attachment',
        uri: asset.uri,
        mimeType: asset.mimeType,
        url: upload?.url || null,
        fileType: upload?.fileType || null
      });
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to upload attachment.');
    } finally {
      setUploadingAttachment(false);
    }
  };

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'top']}>
        <AppTopbar placeholder="Search chats..." />

        {activeConversation ? (
          <KeyboardAvoidingView
            style={styles.chatWrapper}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
            enabled={Platform.OS === 'ios'}
          >
            <View style={styles.chatHeader}>
              <Pressable onPress={() => setActiveId(null)} style={styles.backButton}>
                <Feather name="chevron-left" size={18} color={colors.foreground} />
              </Pressable>
              <View style={styles.chatHeaderInfo}>
                <View style={styles.headerAvatar}>
                  {activeConversation.is_group ? (
                    <Feather name="users" size={16} color={colors.primaryForeground} />
                  ) : (
                    <Text style={styles.avatarText}>{activeTitle.charAt(0)}</Text>
                  )}
                </View>
                <View>
                  <Text style={styles.chatHeaderName}>{activeTitle}</Text>
                  <Text style={styles.chatHeaderStatus}>
                    {activeConversation.is_group
                      ? `${activeConversation.participants?.length || 0} members`
                      : getConversationOnline(activeConversation)
                      ? 'Online'
                      : 'Offline'}
                  </Text>
                </View>
              </View>
              <Pressable style={styles.iconButton} onPress={handleOpenParticipants}>
                <Feather name="users" size={18} color={colors.foreground} />
              </Pressable>
            </View>

            {sendError ? (
              <View style={styles.sendErrorBanner}>
                <Text style={styles.sendErrorText}>{sendError}</Text>
              </View>
            ) : null}

            {loadingMessages ? (
              <View style={styles.loadingBox}>
                <LoadingState label="Loading messages..." />
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={[styles.messagesContent, { paddingBottom: messagesPaddingBottom }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {messages.map((msg) => {
                  const isOwn = msg.sender_id === user?.id;
                  return (
                    <View
                      key={msg.id}
                      style={[styles.messageRow, isOwn ? styles.messageRowOwn : null]}
                    >
                      <View
                        style={[
                          styles.messageBubble,
                          isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther
                        ]}
                      >
                        {!isOwn && activeConversation.is_group && (
                          <Text style={styles.senderLabel}>
                            {msg.sender_name || msg.sender_username || 'User'}
                          </Text>
                        )}
                        <Text
                          style={[
                            styles.messageText,
                            isOwn ? styles.messageTextOwn : styles.messageTextOther
                          ]}
                        >
                          {msg.content}
                        </Text>
                        {msg.attachment_url ? (
                          <Pressable
                            style={styles.attachmentBubble}
                            onPress={() => Linking.openURL(msg.attachment_url as string)}
                          >
                            <Feather
                              name="paperclip"
                              size={12}
                              color={isOwn ? colors.primaryForeground : colors.brand}
                            />
                            <Text
                              style={[
                                styles.attachmentText,
                                isOwn ? styles.attachmentTextOwn : styles.attachmentTextOther
                              ]}
                            >
                              Attachment
                            </Text>
                          </Pressable>
                        ) : null}
                        <Text
                          style={[
                            styles.messageTime,
                            isOwn ? styles.messageTimeOwn : styles.messageTimeOther
                          ]}
                        >
                          {formatTime(msg.created_at)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <View
              style={[
                styles.inputBar,
                {
                  paddingBottom: Math.max(12, insets.bottom + 6),
                  transform:
                    Platform.OS === 'android'
                      ? [
                          {
                            translateY: keyboardVisible ? -(keyboardHeight + insets.bottom) : 0
                          }
                        ]
                      : undefined
                }
              ]}
            >
              {attachment ? (
                <View style={styles.attachmentRow}>
                  <View style={styles.attachmentInfo}>
                    <Feather name="paperclip" size={12} color={colors.mutedForeground} />
                    <Text style={styles.attachmentName} numberOfLines={1}>
                      {attachment.name}
                    </Text>
                  </View>
                  <Pressable onPress={() => setAttachment(null)}>
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.inputRow}>
                <Pressable
                  style={[styles.attachButton, uploadingAttachment && styles.attachButtonDisabled]}
                  onPress={handlePickAttachment}
                  disabled={uploadingAttachment}
                >
                  {uploadingAttachment ? (
                    <ActivityIndicator size="small" color={colors.mutedForeground} />
                  ) : (
                    <Feather name="paperclip" size={16} color={colors.mutedForeground} />
                  )}
                </Pressable>
                <TextInput
                  placeholder="Type a message..."
                  placeholderTextColor={colors.mutedForeground}
                  value={draft}
                  onChangeText={(value) => {
                    setDraft(value);
                    if (sendError) {
                      setSendError(null);
                    }
                  }}
                  style={styles.input}
                  multiline
                />
                <Pressable
                  style={[styles.sendButton, sendDisabled && styles.sendButtonDisabled]}
                  onPress={handleSend}
                  disabled={sendDisabled}
                >
                  <Feather name="send" size={16} color={colors.primaryForeground} />
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
              <View style={styles.heroRow}>
                <View style={styles.heroText}>
                  <Text style={styles.heroTitle}>Messages</Text>
                  <Text style={styles.heroSubtitle}>Communicate with your team</Text>
                  <View style={styles.heroChip}>
                    <Feather name="message-circle" size={12} color="#ffffff" />
                    <Text style={styles.heroChipText}>
                      {conversations.length} Conversations
                    </Text>
                  </View>
                </View>
                <View style={styles.heroActions}>
                  <Pressable style={styles.heroButton} onPress={() => void loadConversations()}>
                    <Feather name="refresh-cw" size={12} color="#ffffff" />
                    <Text style={styles.heroButtonText}>Refresh</Text>
                  </Pressable>
                </View>
              </View>
            </LinearGradient>

            {loading ? (
              <LoadingState label="Loading conversations..." />
            ) : error ? (
              <ErrorState title="Unable to load chats" message={error} onAction={loadConversations} />
            ) : (
              <View style={styles.listCard}>
                <View style={styles.searchRow}>
                  <Feather name="search" size={14} color={colors.mutedForeground} />
                  <TextInput
                    placeholder="Search conversations..."
                    placeholderTextColor={colors.mutedForeground}
                    value={search}
                    onChangeText={setSearch}
                    style={styles.searchInput}
                  />
                  {search.length > 0 && (
                    <Pressable onPress={() => setSearch('')}>
                      <Feather name="x" size={14} color={colors.mutedForeground} />
                    </Pressable>
                  )}
                </View>

                {orderedConversations.map((conv) => {
                  const title = getConversationTitle(conv);
                  return (
                    <Pressable
                      key={conv.id}
                      onPress={() => setActiveId(conv.id)}
                      style={styles.conversationRow}
                    >
                      <View style={styles.avatarWrap}>
                        <View style={styles.avatarCircle}>
                          {conv.is_group ? (
                            <Feather name="users" size={16} color="#ffffff" />
                          ) : (
                            <Text style={styles.avatarText}>{title.charAt(0)}</Text>
                          )}
                        </View>
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor: getConversationOnline(conv)
                                ? colors.success
                                : colors.mutedForeground
                            }
                          ]}
                        />
                      </View>
                      <View style={styles.conversationBody}>
                        <View style={styles.conversationHeader}>
                          <Text style={styles.conversationName}>{title}</Text>
                          <Text style={styles.conversationTime}>
                            {formatTime(conv.last_message_time)}
                          </Text>
                        </View>
                        <View style={styles.conversationFooter}>
                          <Text numberOfLines={1} style={styles.conversationMessage}>
                            {conv.last_message || 'No messages yet'}
                          </Text>
                          {conv.unread_count ? (
                            <View style={styles.unreadBadge}>
                              <Text style={styles.unreadText}>{conv.unread_count}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}

        {showParticipants && activeConversation ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Participants</Text>
                <Pressable onPress={() => setShowParticipants(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              {participantsLoading ? (
                <LoadingState label="Loading participants..." />
              ) : (
                <ScrollView style={styles.modalList}>
                  {participants.map((participant) => (
                    <View key={participant.user_id} style={styles.participantRow}>
                      <View style={styles.participantAvatar}>
                        <Text style={styles.avatarText}>
                          {(participant.full_name || participant.username || 'U').charAt(0)}
                        </Text>
                      </View>
                      <View style={styles.participantInfo}>
                        <Text style={styles.participantName}>
                          {participant.full_name || participant.username || 'User'}
                        </Text>
                        <Text style={styles.participantStatus}>
                          {participant.is_online ? 'Online' : 'Offline'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        ) : null}

      </SafeAreaView>
    </LinearGradient>
  );
};

export default ChatScreen;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24
  },
  heroCard: {
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
    marginBottom: 16
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  heroText: {
    flex: 1
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700'
  },
  heroSubtitle: {
    color: '#e0e7ff',
    fontSize: 12,
    marginTop: 4
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.2)'
  },
  heroChipText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600'
  },
  heroActions: {
    gap: 6
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)'
  },
  heroButtonText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600'
  },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12
  },
  searchInput: {
    flex: 1,
    color: colors.foreground,
    fontSize: 12
  },
  conversationRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  avatarWrap: {
    position: 'relative'
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brandMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: colors.foreground,
    fontWeight: '700'
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.card,
    position: 'absolute',
    bottom: 0,
    right: -2
  },
  conversationBody: {
    flex: 1
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  conversationName: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '600'
  },
  conversationTime: {
    color: colors.mutedForeground,
    fontSize: 10
  },
  conversationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4
  },
  conversationMessage: {
    flex: 1,
    color: colors.mutedForeground,
    fontSize: 11
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center'
  },
  unreadText: {
    color: colors.primaryForeground,
    fontSize: 10,
    fontWeight: '600'
  },
  chatWrapper: {
    flex: 1
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  chatHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  chatHeaderName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600'
  },
  chatHeaderStatus: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 2
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 16
  },
  messageRow: {
    marginBottom: 12,
    alignItems: 'flex-start'
  },
  messageRowOwn: {
    alignItems: 'flex-end'
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  messageBubbleOwn: {
    backgroundColor: colors.brand
  },
  messageBubbleOther: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  senderLabel: {
    color: colors.brand,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4
  },
  messageText: {
    fontSize: 12,
    lineHeight: 18
  },
  messageTextOwn: {
    color: colors.primaryForeground
  },
  messageTextOther: {
    color: colors.foreground
  },
  messageTime: {
    fontSize: 9,
    marginTop: 6,
    alignSelf: 'flex-end'
  },
  messageTimeOwn: {
    color: colors.primaryForeground,
    opacity: 0.7
  },
  messageTimeOther: {
    color: colors.mutedForeground
  },
  inputBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    gap: 8
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  attachButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  attachButtonDisabled: {
    opacity: 0.6
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    marginBottom: 8
  },
  attachmentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1
  },
  attachmentName: {
    color: colors.foreground,
    fontSize: 11,
    flex: 1
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.foreground,
    fontSize: 12,
    textAlignVertical: 'center'
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand
  },
  sendButtonDisabled: {
    opacity: 0.6
  },
  attachmentBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6
  },
  attachmentText: {
    fontSize: 10,
    fontWeight: '600'
  },
  attachmentTextOwn: {
    color: colors.primaryForeground
  },
  attachmentTextOther: {
    color: colors.brand
  },
  loadingBox: {
    padding: 16
  },
  sendErrorBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f87171',
    backgroundColor: 'rgba(248, 113, 113, 0.12)'
  },
  sendErrorText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '600'
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  modalTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600'
  },
  modalList: {
    maxHeight: 320
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  participantAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  participantInfo: {
    flex: 1
  },
  participantName: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  participantStatus: {
    color: colors.mutedForeground,
    fontSize: 10,
    marginTop: 2
  }
});
