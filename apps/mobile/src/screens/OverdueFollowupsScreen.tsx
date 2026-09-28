import React, {useCallback, useEffect, useState, useMemo} from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

type FollowupLead = {
  id?: number;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
  mobile_number?: string | null;
  status?: string | null;
  next_call_at?: string | null;
};

type Followup = {
  id: number;
  lead_id?: number;
  followup_date?: string | null;
  scheduled_at?: string | null;
  followup_type?: string | null;
  type?: string | null;
  status?: string | null;
  completed?: boolean;
  assignedTo?: { id?: number | null; name?: string | null };
  assigned_to?: number | null;
  user_name?: string | null;
  lead?: FollowupLead | null;
};

const statusColors: Record<string, { bg: string; text: string }> = {
  New: { bg: 'rgba(96, 165, 250, 0.2)', text: '#60a5fa' },
  Contacted: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
  Qualified: { bg: 'rgba(139, 92, 246, 0.2)', text: '#a78bfa' },
  Converted: { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' },
  Lost: { bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171' }
};

const followupTypeColors: Record<string, { bg: string; text: string; label: string }> = {
  call: { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa', label: 'Call' },
  email: { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e', label: 'Email' },
  meeting: { bg: 'rgba(139, 92, 246, 0.2)', text: '#a78bfa', label: 'Meeting' },
  task: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b', label: 'Task' },
  other: { bg: 'rgba(148, 163, 184, 0.2)', text: '#cbd5f5', label: 'Other' }
};

const DEFAULT_EVENT_DURATION_MINUTES = 30;

const OverdueFollowupsScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const { isManagerOrHigher, isSales, user } = useAuth();
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'Not scheduled';
    const date = new Date(dateString);
    const today = new Date();
    if (Number.isNaN(date.getTime())) return dateString;
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  };

  const getLeadName = (lead?: FollowupLead | null) => {
    if (lead?.name && lead.name.trim()) return lead.name.trim();
    if (lead?.full_name && lead.full_name.trim()) return lead.full_name.trim();
    if (lead?.email && lead.email.includes('@')) return lead.email.split('@')[0];
    if (lead?.mobile_number) return lead.mobile_number;
    return 'Lead';
  };

  const getFollowupDate = (followup: Followup) =>
    followup.followup_date || followup.scheduled_at || followup.lead?.next_call_at || null;

  const buildGoogleCalendarUrl = (title: string, details: string, start: Date, end: Date) => {
    const formatDate = (value: Date) =>
      value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const params = [
      'action=TEMPLATE',
      `text=${encodeURIComponent(title)}`,
      `details=${encodeURIComponent(details)}`,
      `dates=${formatDate(start)}/${formatDate(end)}`
    ];
    return `https://calendar.google.com/calendar/render?${params.join('&')}`;
  };

  const handleAddToGoogleCalendar = async (followup: Followup) => {
    const followupDate = getFollowupDate(followup);
    if (!followupDate) return;
    const start = new Date(followupDate);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + DEFAULT_EVENT_DURATION_MINUTES * 60 * 1000);
    const lead = followup.lead;
    const leadName = getLeadName(lead);
    const leadPhone = lead?.mobile_number || 'N/A';
    const leadEmail = lead?.email || 'N/A';
    const leadId = lead?.id || followup.lead_id || followup.id;
    const title = `Follow-up: ${leadName}`;
    const details = `Lead ID: ${leadId}\nPhone: ${leadPhone}\nEmail: ${leadEmail}\nType: ${
      followup.followup_type || followup.type || 'Call'
    }\n\nReminder: uses your Google Calendar default reminder settings.`;
    const url = buildGoogleCalendarUrl(title, details, start, end);
    try {
      await Linking.openURL(url);
    } catch {
      setError('Unable to open Google Calendar.');
    }
  };

  const canAddToCalendar = (followup: Followup) => {
    if (!isSales()) return false;
    const assignedId = followup.assignedTo?.id ?? followup.assigned_to ?? null;
    if (!assignedId || assignedId !== user?.id) return false;
    const followupDate = getFollowupDate(followup);
    if (!followupDate) return false;
    const parsed = new Date(followupDate);
    return !Number.isNaN(parsed.getTime());
  };
  const loadOverdue = useCallback(async (isRefresh = false) => {
    setError(null);
    if (!isRefresh) {
      setLoading(true);
    }
    try {
      const data = await apiRequest<{ followups?: Followup[] }>('/followups/overdue');
      setFollowups(data.followups || []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load overdue follow-ups.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOverdue();
  }, [loadOverdue]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadOverdue(true);
  };

  const renderedFollowups = followups.map((followup) => {
    const lead = followup.lead;
    const leadName = getLeadName(lead);
    const leadStatus = lead?.status || 'New';
    const statusStyle = statusColors[leadStatus] || statusColors.New;
    const typeKey = (followup.followup_type || followup.type || 'other').toLowerCase();
    const typeStyle = followupTypeColors[typeKey] || followupTypeColors.other;
    const followupDate = getFollowupDate(followup);
    const leadId = lead?.id || followup.lead_id || followup.id;

    return (
      <View key={followup.id} style={styles.followupCard}>
        <View style={styles.followupHeader}>
          <View style={styles.followupTitle}>
            <Text style={styles.followupName}>{leadName}</Text>
            <Text style={styles.followupMeta}>
              {lead?.mobile_number || 'No phone'} | {lead?.email || 'No email'}
            </Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusChipText, { color: statusStyle.text }]}>
              {leadStatus}
            </Text>
          </View>
        </View>

        <View style={styles.followupRow}>
          <View style={[styles.typeBadge, { backgroundColor: typeStyle.bg }]}>
            <Text style={[styles.typeBadgeText, { color: typeStyle.text }]}>
              {typeStyle.label}
            </Text>
          </View>
          <Text style={styles.followupDate}>{formatDate(followupDate)}</Text>
          <View style={styles.overdueBadge}>
            <Text style={styles.overdueText}>Overdue</Text>
          </View>
        </View>

        {isManagerOrHigher() ? (
          <Text style={styles.assignedText}>
            Assigned to: {followup.assignedTo?.name || followup.user_name || 'Unassigned'}
          </Text>
        ) : null}

        <View style={styles.actionRow}>
          <Button
            label="View Lead"
            variant="secondary"
            size="sm"
            onPress={() =>
              navigation.navigate('Tabs', {
                screen: 'Leads',
                params: { screen: 'LeadDetails', params: { leadId } }
              })
            }
            style={styles.actionButton}
          />
          <Button
            label="Edit Lead"
            variant="ghost"
            size="sm"
            onPress={() =>
              navigation.navigate('Tabs', {
                screen: 'Leads',
                params: { screen: 'LeadForm', params: { mode: 'edit', leadId } }
              })
            }
            style={styles.actionButton}
          />
          {canAddToCalendar(followup) ? (
            <Button
              label="Add to Google"
              variant="ghost"
              size="sm"
              onPress={() => handleAddToGoogleCalendar(followup)}
              style={styles.actionButton}
            />
          ) : null}
        </View>
      </View>
    );
  });

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search overdue follow-ups..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Overdue Follow-ups</Text>
                <Text style={styles.heroSubtitle}>
                  Follow-ups that have passed their scheduled date and are still pending
                </Text>
                <View style={styles.heroChip}>
                  <Feather name="alert-circle" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{followups.length} Overdue Follow-ups</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable style={styles.heroButton} onPress={handleRefresh} disabled={refreshing}>
                  <Feather name="refresh-cw" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>
                    {refreshing ? 'Refreshing' : 'Refresh'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Overdue Follow-ups</Text>
            {loading ? (
              <LoadingState label="Loading overdue follow-ups..." />
            ) : error ? (
              <ErrorState
                title="Unable to load overdue follow-ups"
                message={error}
                onAction={handleRefresh}
              />
            ) : followups.length === 0 ? (
              <EmptyState
                title="No overdue follow-ups"
                message="Great job! All follow-ups are up to date."
                actionLabel="Refresh"
                onAction={handleRefresh}
              />
            ) : (
              renderedFollowups
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default OverdueFollowupsScreen;

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
    borderColor: colors.border
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12
  },
  followupCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg
  },
  followupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  followupTitle: {
    flex: 1,
    marginRight: 10
  },
  followupName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700'
  },
  followupMeta: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 2
  },
  statusChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '600'
  },
  followupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600'
  },
  followupDate: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '600'
  },
  overdueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(248, 113, 113, 0.2)'
  },
  overdueText: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '600'
  },
  assignedText: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginBottom: 10
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap'
  },
  actionButton: {
    flexGrow: 1,
    minWidth: 90
  }
});
