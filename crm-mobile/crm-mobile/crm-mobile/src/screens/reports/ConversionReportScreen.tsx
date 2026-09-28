import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import AppTopbar from '../../components/AppTopbar';
import { apiRequest, type ApiError } from '../../services/api';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';

const RANGE_OPTIONS = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: '1 year', value: '365' }
];

type UserOption = {
  id: number;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  role_id?: number;
  roleId?: number;
};

type FunnelStage = {
  status: string;
  label: string;
  count: number;
};

const STAGES = [
  { status: 'New', label: 'New Leads' },
  { status: 'Contacted', label: 'Contacted' },
  { status: 'Qualified', label: 'Qualified' },
  { status: 'Converted', label: 'Converted' }
];

const ConversionReportScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isManagerOrHigher } = useAuth();
  const [dateRange, setDateRange] = useState('30');
  const [selectedUser, setSelectedUser] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'funnel'>('table');
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, number>>({});

  const loadUsers = useCallback(async () => {
    if (!isManagerOrHigher()) return;
    try {
      const response = await apiRequest<{ users?: UserOption[] }>('/users');
      const filtered = (response.users || []).filter((user) => {
        const role = user.roleId ?? user.role_id;
        return role === 2 || role === 3;
      });
      setUsers(filtered);
    } catch {
      // ignore
    }
  }, [isManagerOrHigher]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('days', dateRange);
      if (selectedUser) {
        params.set('userId', selectedUser);
      }
      const report = await apiRequest<Record<string, number>>(
        `/reports/conversion-report?${params.toString()}`
      );
      setData(report || {});
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load conversion report.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedUser]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const stages: FunnelStage[] = useMemo(
    () =>
      STAGES.map((stage) => ({
        ...stage,
        count: Number(data[stage.status] || 0)
      })),
    [data]
  );

  const totalLeads = stages.reduce((sum, stage) => sum + stage.count, 0);
  const converted = stages.find((stage) => stage.status === 'Converted')?.count || 0;
  const overallConversion = stages[0]?.count ? (converted / stages[0].count) * 100 : 0;

  const getConversionRate = (index: number) => {
    if (index === 0) return 100;
    const prev = stages[index - 1]?.count || 0;
    if (prev === 0) return 0;
    return (stages[index].count / prev) * 100;
  };

  const rangeLabel =
    RANGE_OPTIONS.find((option) => option.value === dateRange)?.label ?? '30 days';

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search conversion report..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Conversion Funnel</Text>
                <Text style={styles.heroSubtitle}>Track lead movement across stages</Text>
                <View style={styles.heroChip}>
                  <Feather name="bar-chart-2" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{totalLeads} Leads</Text>
                </View>
              </View>
              <Pressable style={styles.heroButton} onPress={loadReport}>
                <Feather name="refresh-cw" size={12} color="#ffffff" />
                <Text style={styles.heroButtonText}>Refresh</Text>
              </Pressable>
            </View>
          </LinearGradient>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Filters</Text>
            <Text style={styles.label}>Date Range</Text>
            <Pressable style={styles.selector} onPress={() => setShowRangePicker(true)}>
              <Text style={styles.selectorText}>{rangeLabel}</Text>
              <Feather name="chevron-down" size={16} color="#9aa1b5" />
            </Pressable>
            {isManagerOrHigher() && users.length > 0 ? (
              <>
                <Text style={styles.label}>User</Text>
                <Pressable style={styles.selector} onPress={() => setShowUserPicker(true)}>
                  <Text style={styles.selectorText}>
                    {selectedUser
                      ? users.find((user) => String(user.id) === selectedUser)?.full_name ||
                        users.find((user) => String(user.id) === selectedUser)?.name ||
                        'Selected user'
                      : 'All users'}
                  </Text>
                  <Feather name="chevron-down" size={16} color="#9aa1b5" />
                </Pressable>
              </>
            ) : null}
            <Text style={styles.label}>View Mode</Text>
            <View style={styles.viewToggle}>
              {(['table', 'funnel'] as const).map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => setViewMode(mode)}
                  style={[styles.toggleButton, viewMode === mode && styles.toggleButtonActive]}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      viewMode === mode && styles.toggleTextActive
                    ]}
                  >
                    {mode === 'table' ? 'Table' : 'Funnel'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.kpiGrid}>
            {[
              { label: 'Total Leads', value: totalLeads },
              { label: 'Converted', value: converted },
              { label: 'Conversion %', value: `${overallConversion.toFixed(1)}%` },
              { label: 'Stages', value: stages.length }
            ].map((item) => (
              <View key={item.label} style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{item.label}</Text>
                <Text style={styles.kpiValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Funnel Details</Text>
            {loading ? (
              <LoadingState label="Loading report..." />
            ) : error ? (
              <ErrorState title="Unable to load report" message={error} onAction={loadReport} />
            ) : totalLeads === 0 ? (
              <EmptyState title="No data" message="No conversion data available." />
            ) : viewMode === 'table' ? (
              stages.map((stage, index) => (
                <View key={stage.status} style={styles.stageRow}>
                  <View style={styles.stageHeader}>
                    <Text style={styles.stageLabel}>{stage.label}</Text>
                    <Text style={styles.stageCount}>{stage.count} leads</Text>
                  </View>
                  <View style={styles.stageMetaRow}>
                    <Text style={styles.stageMeta}>
                      {((stage.count / totalLeads) * 100).toFixed(1)}% of total
                    </Text>
                    <Text style={styles.stageMeta}>
                      {index === 0 ? 'Start' : `${getConversionRate(index).toFixed(1)}%`}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              stages.map((stage, index) => {
                const maxCount = stages[0]?.count || 1;
                const width = Math.max(8, (stage.count / maxCount) * 100);
                return (
                  <View key={stage.status} style={styles.funnelRow}>
                    <View style={styles.funnelHeader}>
                      <Text style={styles.funnelLabel}>{stage.label}</Text>
                      <Text style={styles.funnelValue}>{stage.count} leads</Text>
                    </View>
                    <View style={styles.funnelBarTrack}>
                      <View style={[styles.funnelBarFill, { width: `${width}%` }]} />
                    </View>
                    {index > 0 ? (
                      <Text style={styles.funnelRate}>
                        {getConversionRate(index).toFixed(1)}% from previous
                      </Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        {showUserPicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select User</Text>
                <Pressable onPress={() => setShowUserPicker(false)}>
                  <Feather name="x" size={18} color="#cdd2e3" />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setSelectedUser('');
                    setShowUserPicker(false);
                  }}
                >
                  <Text style={styles.modalText}>All users</Text>
                </Pressable>
                {users.map((user) => (
                  <Pressable
                    key={user.id}
                    style={styles.modalRow}
                    onPress={() => {
                      setSelectedUser(String(user.id));
                      setShowUserPicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>
                      {user.full_name || user.name || user.email || `User ${user.id}`}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}

        {showRangePicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Date Range</Text>
                <Pressable onPress={() => setShowRangePicker(false)}>
                  <Feather name="x" size={18} color="#cdd2e3" />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                {RANGE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={styles.modalRow}
                    onPress={() => {
                      setDateRange(option.value);
                      setShowRangePicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>{option.label}</Text>
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

export default ConversionReportScreen;

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
  label: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600'
  },
  selector: {
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
  selectorText: {
    color: colors.foreground,
    fontSize: 12
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a3356',
    overflow: 'hidden'
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: colors.inputBg
  },
  toggleButtonActive: {
    backgroundColor: '#5b3bff'
  },
  toggleText: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600'
  },
  toggleTextActive: {
    color: colors.primaryForeground
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  kpiCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12
  },
  kpiLabel: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  kpiValue: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4
  },
  stageRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg,
    gap: 6
  },
  stageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  stageLabel: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '700'
  },
  stageCount: {
    color: '#cbd5f5',
    fontSize: 11,
    fontWeight: '600'
  },
  stageMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  stageMeta: {
    color: colors.mutedForeground,
    fontSize: 10
  },
  funnelRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg,
    gap: 8
  },
  funnelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  funnelLabel: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '700'
  },
  funnelValue: {
    color: '#cbd5f5',
    fontSize: 11,
    fontWeight: '600'
  },
  funnelBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden'
  },
  funnelBarFill: {
    height: '100%',
    backgroundColor: '#8b5cf6'
  },
  funnelRate: {
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
  modalRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  modalText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  }
});
