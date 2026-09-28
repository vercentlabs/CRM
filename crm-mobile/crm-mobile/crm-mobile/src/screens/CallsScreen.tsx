import React, {useCallback, useEffect, useState, useMemo} from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';

type CallRecord = {
  id: number;
  call_status?: string | null;
  startTime?: string | null;
  duration?: number | null;
  outcome?: string | null;
  lead?: {
    id?: number;
    name?: string | null;
    email?: string | null;
    status?: string | null;
  } | null;
  user?: {
    id?: number;
    name?: string | null;
  } | null;
};

const CallsScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadCalls = useCallback(async (isRefresh = false) => {
    setError(null);
    if (!isRefresh) setLoading(true);
    try {
      const data = await apiRequest<{ calls?: CallRecord[] }>('/calls');
      setCalls(data.calls || []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load calls.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCalls();
  }, [loadCalls]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadCalls(true);
  };

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const csv = await apiRequest<string>('/reports/export-calls-csv', {
        headers: { Accept: 'text/csv' }
      });
      await Share.share({ message: csv, title: 'Calls Export' });
    } catch (err) {
      const apiError = err as ApiError;
      setExportError(apiError.message || 'Failed to export calls.');
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return 'Not scheduled';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return 'Not recorded';
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}:${remaining < 10 ? '0' : ''}${remaining}`;
  };

  const outcomeTone = (outcome?: string | null) => {
    switch (outcome) {
      case 'Connected':
        return { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' };
      case 'No Answer':
        return { bg: 'rgba(251, 191, 36, 0.2)', text: '#fbbf24' };
      case 'Busy':
        return { bg: 'rgba(251, 146, 60, 0.2)', text: '#fb923c' };
      case 'Left Voicemail':
        return { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' };
      default:
        return { bg: 'rgba(148, 163, 184, 0.2)', text: '#cbd5f5' };
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
        <AppTopbar placeholder="Search calls..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Calls</Text>
                <Text style={styles.heroSubtitle}>Recent call activity and outcomes</Text>
                <View style={styles.heroChip}>
                  <Feather name="phone" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{calls.length} Total Calls</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable style={styles.heroButton} onPress={handleRefresh} disabled={refreshing}>
                  <Feather name="refresh-cw" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>
                    {refreshing ? 'Refreshing' : 'Refresh'}
                  </Text>
                </Pressable>
                <Pressable style={styles.heroButton} onPress={handleExport} disabled={exporting}>
                  <Feather name="download" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>
                    {exporting ? 'Exporting' : 'Export'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Call Logs</Text>
            {exportError ? <Text style={styles.inlineError}>{exportError}</Text> : null}
            {loading ? (
              <LoadingState label="Loading calls..." />
            ) : error ? (
              <ErrorState title="Unable to load calls" message={error} onAction={handleRefresh} />
            ) : calls.length === 0 ? (
              <EmptyState title="No calls yet" message="Calls will appear once you start calling leads." />
            ) : (
              calls.map((call) => {
                const tone = outcomeTone(call.outcome);
                const leadId = call.lead?.id;
                return (
                  <View key={call.id} style={styles.callCard}>
                    <View style={styles.callHeader}>
                      <View>
                        <Text style={styles.callName}>{call.lead?.name || 'Unknown Lead'}</Text>
                        <Text style={styles.callMeta}>{call.lead?.email || 'No email'}</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: tone.bg }]}
                      >
                        <Text style={[styles.badgeText, { color: tone.text }]}>
                          {call.outcome || 'Unknown'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.callDetailsRow}>
                      <Text style={styles.callDetail}>Start: {formatDate(call.startTime)}</Text>
                      <Text style={styles.callDetail}>Duration: {formatDuration(call.duration)}</Text>
                    </View>
                    <Text style={styles.callDetail}>Status: {call.call_status || 'Scheduled'}</Text>
                    {call.user?.name ? (
                      <Text style={styles.callDetail}>Owner: {call.user?.name}</Text>
                    ) : null}
                    {leadId ? (
                      <View style={styles.actionRow}>
                        <Button
                          label="View Lead"
                          size="sm"
                          variant="secondary"
                          onPress={() =>
                            navigation.navigate('Tabs', {
                              screen: 'Leads',
                              params: { screen: 'LeadDetails', params: { leadId } }
                            })
                          }
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default CallsScreen;

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
    marginBottom: 16
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12
  },
  inlineError: {
    color: '#f87171',
    fontSize: 11,
    marginBottom: 8
  },
  callCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg
  },
  callHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  callName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700'
  },
  callMeta: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 2
  },
  callDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  callDetail: {
    color: '#cbd5f5',
    fontSize: 11
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600'
  },
  actionRow: {
    marginTop: 8
  }
});
