import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { Button, Chip, EmptyState, Input, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../context/AuthContext';

type LeadOption = {
  id: number;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  mobile_number?: string | null;
  status?: string | null;
};

type BulkResponse = {
  message?: string;
  count?: number;
};

const BulkMessagesScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { isManagerOrHigher } = useAuth();
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [search, setSearch] = useState('');

  const loadLeads = useCallback(async () => {
    setLoadingLeads(true);
    setError(null);
    try {
      const data = await apiRequest<{ leads?: LeadOption[] }>('/leads?page=1&limit=200');
      setLeads(data.leads || []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load leads.');
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return leads;
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const name = (lead.full_name || lead.name || '').toLowerCase();
      const email = (lead.email || '').toLowerCase();
      const phone = (lead.mobile_number || '').toLowerCase();
      return name.includes(term) || email.includes(term) || phone.includes(term);
    });
  }, [leads, search]);

  const toggleLead = (leadId: number) => {
    setSelectedIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredLeads.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(filteredLeads.map((lead) => lead.id));
  };

  const handleSend = async () => {
    if (!isManagerOrHigher()) {
      setError('Only administrators and managers can send bulk messages.');
      return;
    }
    if (selectedIds.length === 0 || !content.trim()) {
      setError('Select at least one lead and enter message content.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const response = await apiRequest<BulkResponse>('/api/lead-messages/bulk', {
        method: 'POST',
        body: {
          leadIds: selectedIds,
          channel,
          content: content.trim()
        }
      });
      setSuccessMessage(response?.message || `Messages queued for ${selectedIds.length} leads.`);
      setSelectedIds([]);
      setContent('');
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to send bulk messages.');
    } finally {
      setSending(false);
    }
  };

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search bulk messages..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Bulk Messages</Text>
                <Text style={styles.heroSubtitle}>
                  Send announcements to multiple leads in one go
                </Text>
                <View style={styles.heroChip}>
                  <Feather name="layers" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{selectedIds.length} Selected</Text>
                </View>
              </View>
              <Pressable style={styles.heroButton} onPress={loadLeads} disabled={loadingLeads}>
                <Feather name="refresh-cw" size={12} color="#ffffff" />
                <Text style={styles.heroButtonText}>
                  {loadingLeads ? 'Loading' : 'Refresh'}
                </Text>
              </Pressable>
            </View>
          </LinearGradient>

          {!isManagerOrHigher() ? (
            <View style={styles.sectionCard}>
              <EmptyState
                title="Access denied"
                message="Only administrators and managers can send bulk messages."
              />
            </View>
          ) : (
            <>
              {successMessage ? (
                <View style={styles.successBanner}>
                  <Text style={styles.successText}>{successMessage}</Text>
                </View>
              ) : null}
              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Select Leads</Text>
                <Input
                  label="Search"
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by name or email"
                />
                <View style={styles.selectRow}>
                  <Pressable style={styles.selectAllButton} onPress={handleSelectAll}>
                    <Feather
                      name={
                        selectedIds.length === filteredLeads.length && filteredLeads.length > 0
                          ? 'check-square'
                          : 'square'
                      }
                      size={16}
                      color="#c7d2fe"
                    />
                    <Text style={styles.selectAllText}>Select all ({filteredLeads.length})</Text>
                  </Pressable>
                  <Text style={styles.selectionCount}>{selectedIds.length} selected</Text>
                </View>

                {loadingLeads ? (
                  <LoadingState label="Loading leads..." />
                ) : filteredLeads.length === 0 ? (
                  <EmptyState title="No leads" message="No leads available for bulk messaging." />
                ) : (
                  filteredLeads.map((lead) => {
                    const leadName = lead.full_name || lead.name || `Lead #${lead.id}`;
                    const selected = selectedIds.includes(lead.id);
                    return (
                      <Pressable
                        key={lead.id}
                        style={[styles.leadRow, selected && styles.leadRowActive]}
                        onPress={() => toggleLead(lead.id)}
                      >
                        <View style={styles.leadInfo}>
                          <Text style={styles.leadName}>{leadName}</Text>
                          <Text style={styles.leadMeta}>
                            {lead.email || lead.mobile_number || 'No contact info'}
                          </Text>
                        </View>
                        <View style={styles.leadBadge}>
                          <Text style={styles.leadBadgeText}>{lead.status || 'Lead'}</Text>
                        </View>
                        <Feather
                          name={selected ? 'check-circle' : 'circle'}
                          size={16}
                          color={selected ? '#22c55e' : '#94a3b8'}
                        />
                      </Pressable>
                    );
                  })
                )}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Message</Text>
                <Text style={styles.label}>Channel</Text>
                <View style={styles.channelRow}>
                  {(['whatsapp', 'sms'] as const).map((option) => (
                    <Chip
                      key={option}
                      label={option}
                      active={channel === option}
                      onPress={() => setChannel(option)}
                    />
                  ))}
                </View>
                <Input
                  label="Message Content"
                  value={content}
                  onChangeText={setContent}
                  multiline
                  style={styles.messageInput}
                  placeholder="Enter your message..."
                />
                <View style={styles.formActions}>
                  <Button
                    label={sending ? 'Sending...' : `Send to ${selectedIds.length} Leads`}
                    onPress={handleSend}
                    loading={sending}
                    disabled={sending || selectedIds.length === 0}
                  />
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default BulkMessagesScreen;

const styles = StyleSheet.create({
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
    backgroundColor: '#11182b',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2645',
    marginBottom: 16,
    gap: 12
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600'
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  selectAllText: {
    color: '#c7d2fe',
    fontSize: 12,
    fontWeight: '600'
  },
  selectionCount: {
    color: '#9aa1b5',
    fontSize: 11
  },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2645',
    backgroundColor: '#0f1526'
  },
  leadRowActive: {
    borderColor: '#6366f1',
    backgroundColor: 'rgba(99, 102, 241, 0.12)'
  },
  leadInfo: {
    flex: 1
  },
  leadName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  leadMeta: {
    color: '#9aa1b5',
    fontSize: 10,
    marginTop: 2
  },
  leadBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(99, 102, 241, 0.2)'
  },
  leadBadgeText: {
    color: '#c7d2fe',
    fontSize: 9,
    fontWeight: '600'
  },
  label: {
    color: '#9aa1b5',
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
    marginTop: 4
  },
  successBanner: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  successText: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600'
  },
  errorBanner: {
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600'
  }
});
