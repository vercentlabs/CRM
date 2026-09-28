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

type Bucket = {
  key: string;
  label: string;
  count: number;
  color: string;
};

const BUCKETS = [
  { key: '0-1_days', label: '0-1 days', color: '#22c55e' },
  { key: '2-3_days', label: '2-3 days', color: '#f59e0b' },
  { key: '4-7_days', label: '4-7 days', color: '#fb923c' },
  { key: '7+_days', label: '7+ days', color: '#f87171' }
];

const LeadAgingReportScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isManagerOrHigher } = useAuth();
  const [dateRange, setDateRange] = useState('30');
  const [selectedUser, setSelectedUser] = useState('');
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
        `/reports/lead-aging?${params.toString()}`
      );
      setData(report || {});
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load lead aging report.');
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

  const buckets: Bucket[] = useMemo(
    () =>
      BUCKETS.map((bucket) => ({
        ...bucket,
        count: Number(data[bucket.key] || 0)
      })),
    [data]
  );

  const totalLeads = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search lead aging..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Lead Aging</Text>
                <Text style={styles.heroSubtitle}>See how long leads stay in the pipeline</Text>
                <View style={styles.heroChip}>
                  <Feather name="clock" size={12} color="#ffffff" />
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
            {isManagerOrHigher() && users.length > 0 ? (
              <>
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
              </>
            ) : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Summary</Text>
            {loading ? (
              <LoadingState label="Loading report..." />
            ) : error ? (
              <ErrorState title="Unable to load report" message={error} onAction={loadReport} />
            ) : totalLeads === 0 ? (
              <EmptyState title="No leads" message="No lead aging data available." />
            ) : (
              buckets.map((bucket) => {
                const percent = totalLeads > 0 ? (bucket.count / totalLeads) * 100 : 0;
                return (
                  <View key={bucket.key} style={styles.bucketRow}>
                    <View style={styles.bucketInfo}>
                      <Text style={styles.bucketLabel}>{bucket.label}</Text>
                      <Text style={styles.bucketCount}>{bucket.count} leads</Text>
                    </View>
                    <View style={styles.bucketBarWrap}>
                      <View
                        style={[
                          styles.bucketBar,
                          { width: `${percent}%`, backgroundColor: bucket.color }
                        ]}
                      />
                    </View>
                    <Text style={styles.bucketPercent}>{percent.toFixed(1)}%</Text>
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

export default LeadAgingReportScreen;

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
  bucketRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg,
    gap: 8
  },
  bucketInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  bucketLabel: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '700'
  },
  bucketCount: {
    color: '#cbd5f5',
    fontSize: 11,
    fontWeight: '600'
  },
  bucketBarWrap: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden'
  },
  bucketBar: {
    height: '100%'
  },
  bucketPercent: {
    color: colors.mutedForeground,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right'
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
