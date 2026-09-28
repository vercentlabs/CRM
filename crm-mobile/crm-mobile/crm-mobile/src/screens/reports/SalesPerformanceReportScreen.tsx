import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppTopbar from '../../components/AppTopbar';
import { apiRequest, type ApiError } from '../../services/api';
import { Button, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import type { ReportsStackParamList } from '../../navigation/ReportsStack';

const RANGE_OPTIONS = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: '1 year', value: '365' }
];

type ReportRow = {
  id: number;
  name: string;
  email: string;
  totalLeads: number;
  convertedLeads: number;
  conversionRate: number;
};

type UserOption = {
  id: number;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  role_id?: number;
  roleId?: number;
};

const SalesPerformanceReportScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ReportsStackParamList>>();
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isManagerOrHigher } = useAuth();
  const canView = isManagerOrHigher();
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [dateRange, setDateRange] = useState('30');
  const [selectedUser, setSelectedUser] = useState('');
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!canView) return;
    try {
      const data = await apiRequest<{ users?: UserOption[] }>('/users');
      const filtered = (data.users || []).filter((user) => {
        const role = user.roleId ?? user.role_id;
        return role === 2 || role === 3;
      });
      setUsers(filtered);
    } catch {
      // ignore user list errors
    }
  }, [canView]);

  const loadReport = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('days', dateRange);
      if (selectedUser) {
        params.set('userId', selectedUser);
      }
      const data = await apiRequest<ReportRow[]>(
        `/reports/sales-performance?${params.toString()}`
      );
      setReportData(data || []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load sales performance report.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedUser, canView]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const summary = useMemo(() => {
    const totalLeads = reportData.reduce((sum, item) => sum + item.totalLeads, 0);
    const converted = reportData.reduce((sum, item) => sum + item.convertedLeads, 0);
    const conversionRate = totalLeads > 0 ? (converted / totalLeads) * 100 : 0;
    return {
      teamMembers: reportData.length,
      totalLeads,
      converted,
      conversionRate
    };
  }, [reportData]);

  if (!canView) {
    return (
      <LinearGradient
        colors={colors.screenGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <AppTopbar placeholder="Search sales performance..." />
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
              <View style={styles.heroRow}>
                <View style={styles.heroText}>
                  <Text style={styles.heroTitle}>Sales Performance</Text>
                  <Text style={styles.heroSubtitle}>Team-level performance insights</Text>
                </View>
              </View>
            </LinearGradient>
            <View style={styles.sectionCard}>
              <EmptyState
                title="Access denied"
                message="Only administrators and managers can view sales performance reports."
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search sales performance..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Sales Performance</Text>
                <Text style={styles.heroSubtitle}>Track conversion metrics by teammate</Text>
                <View style={styles.heroChip}>
                  <Feather name="trending-up" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{summary.teamMembers} Members</Text>
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
            <Pressable
              style={styles.selector}
              onPress={() => {
                setShowUserPicker(false);
                setShowRangePicker(true);
              }}
            >
              <Text style={styles.selectorText}>
                {RANGE_OPTIONS.find((option) => option.value === dateRange)?.label ||
                  'Select range'}
              </Text>
              <Feather name="chevron-down" size={16} color="#9aa1b5" />
            </Pressable>
            <Text style={styles.label}>User</Text>
            <Pressable
              style={styles.selector}
              onPress={() => {
                setShowRangePicker(false);
                setShowUserPicker(true);
              }}
            >
              <Text style={styles.selectorText}>
                {selectedUser
                  ? users.find((user) => String(user.id) === selectedUser)?.full_name ||
                    users.find((user) => String(user.id) === selectedUser)?.name ||
                    'Selected user'
                  : 'All users'}
              </Text>
              <Feather name="chevron-down" size={16} color="#9aa1b5" />
            </Pressable>
          </View>

          <View style={styles.kpiGrid}>
            {[
              { label: 'Team Members', value: summary.teamMembers },
              { label: 'Total Leads', value: summary.totalLeads },
              { label: 'Converted', value: summary.converted },
              { label: 'Conversion %', value: `${summary.conversionRate.toFixed(1)}%` }
            ].map((item) => (
              <View key={item.label} style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{item.label}</Text>
                <Text style={styles.kpiValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Performance Breakdown</Text>
            {loading ? (
              <LoadingState label="Loading report..." />
            ) : error ? (
              <ErrorState title="Unable to load report" message={error} onAction={loadReport} />
            ) : reportData.length === 0 ? (
              <EmptyState title="No data" message="No performance data available." />
            ) : (
              reportData.map((row) => (
                <Pressable
                  key={row.id}
                  style={styles.reportRow}
                  onPress={() =>
                    navigation.navigate('SalesPerformanceDetail', {
                      userId: row.id,
                      userName: row.name,
                      userEmail: row.email
                    })
                  }
                >
                  <View style={styles.reportInfo}>
                    <Text style={styles.reportName}>{row.name || 'User'}</Text>
                    <Text style={styles.reportMeta}>{row.email}</Text>
                  </View>
                  <View style={styles.reportMetrics}>
                    <Text style={styles.reportMetric}>{row.totalLeads} Leads</Text>
                    <Text style={styles.reportMetric}>{row.convertedLeads} Won</Text>
                    <Text style={styles.reportMetric}>{row.conversionRate.toFixed(1)}%</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color="#6f7896" />
                </Pressable>
              ))
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
                <Text style={styles.modalTitle}>Select Range</Text>
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

export default SalesPerformanceReportScreen;

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
  reportRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  reportInfo: {
    flex: 1
  },
  reportName: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '700'
  },
  reportMeta: {
    color: colors.mutedForeground,
    fontSize: 10,
    marginTop: 2
  },
  reportMetrics: {
    alignItems: 'flex-end',
    gap: 4
  },
  reportMetric: {
    color: '#cbd5f5',
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
