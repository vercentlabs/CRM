import React, {useCallback, useEffect, useState, useMemo} from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { Button, Chip, EmptyState, ErrorState, Input, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

type LeadMessage = {
  id: number;
  lead_id: number;
  lead_name?: string | null;
  message_type?: string | null;
  content?: string | null;
  status?: string | null;
  sent_at?: string | null;
};

type LeadOption = {
  id: number;
  name: string;
};

type FormState = {
  leadId: string;
  channel: 'whatsapp' | 'sms';
  content: string;
};

const emptyForm: FormState = {
  leadId: '',
  channel: 'whatsapp',
  content: ''
};

const LeadMessagesScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const { isManagerOrHigher } = useAuth();
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [showLeadPicker, setShowLeadPicker] = useState(false);

  const loadMessages = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ messages?: LeadMessage[] }>('/api/lead-messages');
      setMessages(data.messages || []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load lead messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLeads = useCallback(async () => {
    try {
      const data = await apiRequest<{ leads?: { id: number; full_name?: string | null; name?: string | null }[] }>('/leads?page=1&limit=50');
      const options = (data.leads || []).map((lead) => ({
        id: lead.id,
        name: lead.full_name || lead.name || `Lead ${lead.id}`
      }));
      setLeadOptions(options);
    } catch (err) {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const handleSend = async () => {
    if (!form.leadId || !form.content.trim()) {
      setError('Lead and content are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/lead-messages/send', {
        method: 'POST',
        body: {
          leadId: Number(form.leadId),
          channel: form.channel,
          content: form.content.trim()
        }
      });
      setShowForm(false);
      setForm(emptyForm);
      await loadMessages();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to send message.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search lead messages..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Lead Messages</Text>
                <Text style={styles.heroSubtitle}>Stay connected with your leads</Text>
                <View style={styles.heroChip}>
                  <Feather name="message-square" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{messages.length} Messages</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable
                  style={styles.heroButton}
                  onPress={() => {
                    setShowForm(true);
                    void loadLeads();
                  }}
                >
                  <Feather name="plus" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>New</Text>
                </Pressable>
                {isManagerOrHigher() ? (
                  <Pressable
                    style={styles.heroButton}
                    onPress={() => navigation.navigate('BulkMessages')}
                  >
                    <Feather name="layers" size={12} color="#ffffff" />
                    <Text style={styles.heroButtonText}>Bulk</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </LinearGradient>

          {error ? (
            <ErrorState title="Action failed" message={error} onAction={loadMessages} />
          ) : null}

          {showForm ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>New Message</Text>
              <Pressable
                style={styles.leadPicker}
                onPress={() => {
                  setShowLeadPicker(true);
                  void loadLeads();
                }}
              >
                <Text style={styles.leadPickerText}>
                  {form.leadId
                    ? leadOptions.find((lead) => String(lead.id) === form.leadId)?.name || 'Selected Lead'
                    : 'Select Lead'}
                </Text>
                <Feather name="chevron-down" size={16} color="#9aa1b5" />
              </Pressable>
              <Text style={styles.label}>Channel</Text>
              <View style={styles.channelRow}>
                {(['whatsapp', 'sms'] as const).map((channel) => (
                  <Chip
                    key={channel}
                    label={channel}
                    active={form.channel === channel}
                    onPress={() => setForm((prev) => ({ ...prev, channel }))}
                  />
                ))}
              </View>
              <Input
                label="Message"
                value={form.content}
                onChangeText={(value) => setForm((prev) => ({ ...prev, content: value }))}
                multiline
                style={styles.messageInput}
              />
              <View style={styles.formActions}>
                <Button label="Cancel" variant="secondary" onPress={() => setShowForm(false)} />
                <Button
                  label={saving ? 'Sending...' : 'Send'}
                  onPress={handleSend}
                  loading={saving}
                  disabled={saving}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Recent Messages</Text>
            {loading ? (
              <LoadingState label="Loading messages..." />
            ) : messages.length === 0 ? (
              <EmptyState title="No messages" message="Send a message to get started." />
            ) : (
              messages.map((message) => (
                <View key={message.id} style={styles.messageCard}>
                  <View style={styles.messageHeader}>
                    <View>
                      <Text style={styles.messageLead}>{message.lead_name || 'Lead'}</Text>
                      <Text style={styles.messageMeta}>{formatDate(message.sent_at)}</Text>
                    </View>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{message.message_type || 'sms'}</Text>
                    </View>
                  </View>
                  <Text style={styles.messageBody}>{message.content || '-'}</Text>
                  <Text style={styles.messageStatus}>Status: {message.status || 'Sent'}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {showLeadPicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Lead</Text>
                <Pressable onPress={() => setShowLeadPicker(false)}>
                  <Feather name="x" size={18} color="#cdd2e3" />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                {leadOptions.map((lead) => (
                  <Pressable
                    key={lead.id}
                    style={styles.leadRow}
                    onPress={() => {
                      setForm((prev) => ({ ...prev, leadId: String(lead.id) }));
                      setShowLeadPicker(false);
                    }}
                  >
                    <Text style={styles.leadName}>{lead.name}</Text>
                    <Feather name="chevron-right" size={16} color="#9aa1b5" />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  );
};

export default LeadMessagesScreen;

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
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    gap: 12
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600'
  },
  leadPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg
  },
  leadPickerText: {
    color: colors.foreground,
    fontSize: 12
  },
  label: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600'
  },
  channelRow: {
    flexDirection: 'row',
    gap: 8
  },
  messageInput: {
    height: 90,
    textAlignVertical: 'top'
  },
  formActions: {
    flexDirection: 'row',
    gap: 12
  },
  messageCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6
  },
  messageLead: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '700'
  },
  messageMeta: {
    color: colors.mutedForeground,
    fontSize: 10,
    marginTop: 2
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(99, 102, 241, 0.2)'
  },
  badgeText: {
    color: '#c7d2fe',
    fontSize: 10,
    fontWeight: '600'
  },
  messageBody: {
    color: '#cbd5f5',
    fontSize: 12,
    marginBottom: 6
  },
  messageStatus: {
    color: colors.mutedForeground,
    fontSize: 10
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
  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  leadName: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  }
});
