import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import AppTopbar from '../components/AppTopbar';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { type ApiError } from '../services/api';
import {
  sendAgentMessage,
  type AgentContext,
  type AgentResponse,
  type PendingAction
} from '../services/aiAgent';

type ChatBubble = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status?: AgentResponse['status'];
};

const suggestions = [
  'Create lead Rahul with phone 9876543210',
  'Show overdue followups',
  'Assign lead 42 to user 7',
  'Schedule followup for lead 12 tomorrow 3pm',
  'Send WhatsApp to lead 9: "Hi, following up on your inquiry."',
  'Dashboard summary'
];

const AIAgentScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);

  const [messages, setMessages] = useState<ChatBubble[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hi! I can run CRM actions for you. Tell me what you want to do, and I will ask if anything is missing.'
    }
  ]);
  const [draft, setDraft] = useState('');
  const [context, setContext] = useState<AgentContext | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  const appendMessage = useCallback((bubble: ChatBubble) => {
    setMessages((prev) => [...prev, bubble]);
    scrollToEnd();
  }, []);

  const handleSend = useCallback(
    async (message?: string, options?: { confirm?: boolean }) => {
      const content = (message ?? draft).trim();
      if (!content && !options?.confirm) return;
      if (sending) return;

      if (content) {
        appendMessage({
          id: `${Date.now()}-user`,
          role: 'user',
          text: content
        });
      }

      setSending(true);
      setError(null);

      try {
        const response = await sendAgentMessage({
          message: content || undefined,
          context,
          confirm: options?.confirm || false,
          pending_action: options?.confirm ? pendingAction : undefined
        });

        if (response.context) {
          setContext(response.context);
        }
        if (response.status === 'confirm' && response.pending_action) {
          setPendingAction(response.pending_action);
        } else {
          setPendingAction(null);
        }

        appendMessage({
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          text: response.reply,
          status: response.status
        });
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError?.message || 'Unable to reach the AI agent. Please try again.');
        appendMessage({
          id: `${Date.now()}-assistant-error`,
          role: 'assistant',
          text: 'I ran into a network issue while contacting the AI agent.',
          status: 'error'
        });
      } finally {
        setSending(false);
        setDraft('');
      }
    },
    [appendMessage, context, draft, pendingAction, sending]
  );

  const handleConfirm = useCallback(async () => {
    if (!pendingAction) return;
    appendMessage({
      id: `${Date.now()}-user-confirm`,
      role: 'user',
      text: 'Proceed with that.'
    });
    await handleSend('', { confirm: true });
  }, [appendMessage, handleSend, pendingAction]);

  const handleCancel = () => {
    setPendingAction(null);
    appendMessage({
      id: `${Date.now()}-assistant-cancel`,
      role: 'assistant',
      text: 'Okay, I will not proceed with that.',
      status: 'clarify'
    });
  };

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'top']}>
        <AppTopbar placeholder="Ask the AI agent..." />

        <KeyboardAvoidingView
          style={styles.chatWrapper}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <LinearGradient colors={['#4338ca', '#6366f1']} style={styles.heroCard}>
              <Text style={styles.heroTitle}>AI Agent</Text>
              <Text style={styles.heroSubtitle}>
                Run leads, tasks, follow-ups, messages, and reports by chat.
              </Text>
              <View style={styles.heroTagRow}>
                <View style={styles.heroTag}>
                  <Feather name="shield" size={12} color="#ffffff" />
                  <Text style={styles.heroTagText}>Role-aware</Text>
                </View>
                <View style={styles.heroTag}>
                  <Feather name="cpu" size={12} color="#ffffff" />
                  <Text style={styles.heroTagText}>Tool-driven</Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.suggestionsCard}>
              <Text style={styles.suggestionsTitle}>Try asking</Text>
              <View style={styles.suggestionWrap}>
                {suggestions.map((item) => (
                  <Pressable
                    key={item}
                    style={styles.suggestionChip}
                    onPress={() => setDraft(item)}
                  >
                    <Text style={styles.suggestionText}>{item}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <View
                  key={msg.id}
                  style={[styles.messageRow, isUser ? styles.messageRowOwn : null]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isUser ? styles.messageBubbleOwn : styles.messageBubbleOther
                    ]}
                  >
                    {!isUser && msg.status ? (
                      <View style={styles.statusPill}>
                        <Text style={styles.statusPillText}>{msg.status}</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.messageText, isUser ? styles.messageTextOwn : styles.messageTextOther]}>
                      {msg.text}
                    </Text>
                  </View>
                </View>
              );
            })}

            {sending ? (
              <View style={styles.typingRow}>
                <ActivityIndicator size="small" color={colors.brand} />
                <Text style={styles.typingText}>Thinking...</Text>
              </View>
            ) : null}
          </ScrollView>

          {pendingAction ? (
            <View style={styles.confirmBar}>
              <View style={styles.confirmTextBlock}>
                <Text style={styles.confirmTitle}>Confirmation required</Text>
                <Text style={styles.confirmSubtitle}>
                  Tool: {pendingAction.tool}
                </Text>
              </View>
              <View style={styles.confirmActions}>
                <Pressable style={styles.confirmButton} onPress={handleConfirm}>
                  <Text style={styles.confirmButtonText}>Proceed</Text>
                </Pressable>
                <Pressable style={styles.cancelButton} onPress={handleCancel}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={[styles.inputBar, { paddingBottom: Math.max(12, insets.bottom + 6) }]}>
            <View style={styles.inputRow}>
              <TextInput
                placeholder="Type a CRM command..."
                placeholderTextColor={colors.mutedForeground}
                value={draft}
                onChangeText={setDraft}
                style={styles.input}
                multiline
              />
              <Pressable
                style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
                onPress={() => handleSend()}
                disabled={!draft.trim() || sending}
              >
                <Feather name="send" size={16} color={colors.primaryForeground} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default AIAgentScreen;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1
    },
    safeArea: {
      flex: 1
    },
    chatWrapper: {
      flex: 1
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 20
    },
    heroCard: {
      borderRadius: 18,
      padding: 18,
      marginBottom: 16
    },
    heroTitle: {
      color: '#ffffff',
      fontSize: 20,
      fontWeight: '700'
    },
    heroSubtitle: {
      color: '#e0e7ff',
      fontSize: 12,
      marginTop: 6
    },
    heroTagRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12
    },
    heroTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.18)'
    },
    heroTagText: {
      color: '#ffffff',
      fontSize: 10,
      fontWeight: '600'
    },
    suggestionsCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 18
    },
    suggestionsTitle: {
      color: colors.foreground,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 10
    },
    suggestionWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8
    },
    suggestionChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputBg
    },
    suggestionText: {
      color: colors.mutedForeground,
      fontSize: 11
    },
    messageRow: {
      marginBottom: 12,
      alignItems: 'flex-start'
    },
    messageRowOwn: {
      alignItems: 'flex-end'
    },
    messageBubble: {
      maxWidth: '85%',
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10
    },
    messageBubbleOwn: {
      backgroundColor: colors.brand
    },
    messageBubbleOther: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border
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
    statusPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: colors.brandMuted,
      marginBottom: 6
    },
    statusPillText: {
      color: colors.brand,
      fontSize: 9,
      fontWeight: '600',
      textTransform: 'uppercase'
    },
    typingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 8,
      marginTop: 6
    },
    typingText: {
      color: colors.mutedForeground,
      fontSize: 11
    },
    confirmBar: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 8
    },
    confirmTextBlock: {
      gap: 4
    },
    confirmTitle: {
      color: colors.foreground,
      fontSize: 12,
      fontWeight: '700'
    },
    confirmSubtitle: {
      color: colors.mutedForeground,
      fontSize: 11
    },
    confirmActions: {
      flexDirection: 'row',
      gap: 8
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.brand,
      alignItems: 'center'
    },
    confirmButtonText: {
      color: colors.primaryForeground,
      fontSize: 12,
      fontWeight: '700'
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center'
    },
    cancelButtonText: {
      color: colors.mutedForeground,
      fontSize: 12,
      fontWeight: '700'
    },
    errorBanner: {
      marginHorizontal: 16,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#f87171',
      backgroundColor: 'rgba(248, 113, 113, 0.12)'
    },
    errorText: {
      color: '#f87171',
      fontSize: 11,
      fontWeight: '600'
    },
    inputBar: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.card
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
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
    }
  });
