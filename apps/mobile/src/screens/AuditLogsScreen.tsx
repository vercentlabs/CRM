import React, {useCallback, useEffect, useState, useMemo} from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'create', label: 'Create (All)' },
  { value: 'update', label: 'Update (All)' },
  { value: 'delete', label: 'Delete (All)' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'LOGIN_SUCCESS', label: 'Login Success' },
  { value: 'LOGOUT_SUCCESS', label: 'Logout Success' },
  { value: 'CREATE', label: 'Create (Generic)' },
  { value: 'UPDATE', label: 'Update (Generic)' },
  { value: 'DELETE', label: 'Delete (Generic)' },
  { value: 'CREATE_LEAD', label: 'Create Lead' },
  { value: 'ASSIGN_LEAD', label: 'Assign Lead' },
  { value: 'UPDATE_LEAD_STATUS', label: 'Update Lead Status' },
  { value: 'LEAD_CONVERTED_TO_CUSTOMER', label: 'Lead Converted to Customer' },
  { value: 'CREATE_FOLLOWUP', label: 'Create Follow-up' },
  { value: 'COMPLETE_FOLLOWUP', label: 'Complete Follow-up' },
  { value: 'MARK_FOLLOWUP_OVERDUE', label: 'Mark Follow-up Overdue' },
  { value: 'CREATE_OPPORTUNITY', label: 'Create Opportunity' },
  { value: 'ASSIGN_OPPORTUNITY', label: 'Assign Opportunity' },
  { value: 'UPDATE_OPPORTUNITY_STAGE', label: 'Update Opportunity Stage' },
  { value: 'CREATE_TASK', label: 'Create Task' },
  { value: 'UPDATE_TASK', label: 'Update Task' },
  { value: 'DELETE_TASK', label: 'Delete Task' },
  { value: 'CREATE_SALES_LOCATION', label: 'Create Sales Location' },
  { value: 'UPDATE_SALES_LOCATION', label: 'Update Sales Location' },
  { value: 'DELETE_SALES_LOCATION', label: 'Delete Sales Location' },
  { value: 'CUSTOMER_CREATED', label: 'Customer Created' },
  { value: 'CUSTOMER_UPDATED', label: 'Customer Updated' },
  { value: 'CUSTOMER_DELETED', label: 'Customer Deleted' },
  { value: 'CREATE_USER', label: 'Create User' },
  { value: 'UPDATE_USER', label: 'Update User' },
  { value: 'UPDATE_USER_STATUS', label: 'Update User Status' }
];

type AuditLog = {
  id: number;
  user_id?: number | null;
  user_email?: string | null;
  action?: string | null;
  table_name?: string | null;
  record_id?: number | null;
  created_at?: string | null;
  ip_address?: string | null;
};

type AuditResponse = {
  audit_logs?: AuditLog[];
  pagination?: {
    page: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
  };
};

type UserOption = {
  id: number;
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
};

const AuditLogsScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showActionPicker, setShowActionPicker] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const limit = 20;

  useEffect(() => {
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const data = await apiRequest<{ users?: UserOption[] }>('/users');
        setUsers(data.users || []);
      } catch {
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };
    void loadUsers();
  }, []);

  const loadLogs = useCallback(
    async (pageNumber = 1, append = false, silent = false) => {
      if (append) {
        setLoadingMore(true);
      } else if (!silent) {
        setLoading(true);
      }
      if (!silent) {
        setError(null);
      }
      try {
        const params = new URLSearchParams();
        params.set('page', String(pageNumber));
        params.set('limit', String(limit));
        if (action.trim()) params.set('action', action.trim());
        if (userId.trim()) params.set('user_id', userId.trim());
        if (startDate.trim()) params.set('start_date', startDate.trim());
        if (endDate.trim()) params.set('end_date', endDate.trim());

        const data = await apiRequest<AuditResponse>(`/audit?${params.toString()}`);
        const nextLogs = data.audit_logs || [];
        setLogs((prev) => (append ? [...prev, ...nextLogs] : nextLogs));
        setPage(data.pagination?.page || pageNumber);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalItems(data.pagination?.totalItems || nextLogs.length);
      } catch (err) {
        const apiError = err as ApiError;
        if (!silent) {
          setError(apiError.message || 'Failed to load audit logs.');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
        setLoadingMore(false);
      }
    },
    [action, userId, startDate, endDate]
  );

  useFocusEffect(
    useCallback(() => {
      // Refresh logs when the screen regains focus and keep polling in the background.
      void loadLogs(1);
      const interval = setInterval(() => {
        void loadLogs(1, false, true);
      }, 15000);
      return () => clearInterval(interval);
    }, [loadLogs])
  );

  const formatFilterDate = (value?: string | null) => {
    if (!value) return 'Select date';
    const parts = value.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}-${month}-${year}`;
    }
    return value;
  };

  const handleDateChange = (field: 'start' | 'end') => (_event: unknown, selected?: Date) => {
    if (Platform.OS === 'android' && !selected) {
      field === 'start' ? setShowStartPicker(false) : setShowEndPicker(false);
      return;
    }
    if (!selected) return;
    const next = selected.toISOString().slice(0, 10);
    if (field === 'start') {
      setStartDate(next);
      setShowStartPicker(false);
    } else {
      setEndDate(next);
      setShowEndPicker(false);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const actionTone = (value?: string | null) => {
    const normalized = (value || '').toLowerCase();
    if (normalized.includes('login')) {
      return { bg: 'rgba(99, 102, 241, 0.2)', text: '#a5b4fc' };
    }
    if (normalized.includes('logout')) {
      return { bg: 'rgba(148, 163, 184, 0.2)', text: '#cbd5f5' };
    }
    if (normalized.includes('delete')) {
      return { bg: 'rgba(248, 113, 113, 0.2)', text: '#f87171' };
    }
    if (
      normalized.includes('update') ||
      normalized.includes('assign') ||
      normalized.includes('complete') ||
      normalized.includes('mark') ||
      normalized.includes('convert')
    ) {
      return { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' };
    }
    if (normalized.includes('create')) {
      return { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' };
    }
    return { bg: 'rgba(148, 163, 184, 0.2)', text: '#cbd5f5' };
  };

  const actionLabel =
    ACTION_OPTIONS.find((option) => option.value === action)?.label || 'All actions';
  const userLabel = userId
    ? users.find((user) => String(user.id) === userId)?.full_name ||
      users.find((user) => String(user.id) === userId)?.username ||
      users.find((user) => String(user.id) === userId)?.email ||
      `User ${userId}`
    : 'All users';

  const startItem = totalItems === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, totalItems);

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search audit logs..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Audit Logs</Text>
                <Text style={styles.heroSubtitle}>Monitor system activity and changes</Text>
                <View style={styles.heroChip}>
                  <Feather name="activity" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{logs.length} Records</Text>
                </View>
              </View>
              <Pressable style={styles.heroButton} onPress={() => loadLogs(1)}>
                <Feather name="refresh-cw" size={12} color="#ffffff" />
                <Text style={styles.heroButtonText}>Refresh</Text>
              </Pressable>
            </View>
          </LinearGradient>

          <View style={styles.filterCard}>
            <Text style={styles.sectionTitle}>Filters</Text>
            <Text style={styles.label}>Action</Text>
            <Pressable style={styles.selector} onPress={() => setShowActionPicker(true)}>
              <Text style={styles.selectorText}>{actionLabel}</Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>

            <Text style={styles.label}>User</Text>
            <Pressable
              style={styles.selector}
              onPress={() => setShowUserPicker(true)}
              disabled={loadingUsers}
            >
              <Text style={styles.selectorText}>{userLabel}</Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>
            {loadingUsers ? (
              <Text style={styles.inlineHelper}>Loading users...</Text>
            ) : null}

            <Text style={styles.label}>Start Date</Text>
            <Pressable style={styles.selector} onPress={() => setShowStartPicker(true)}>
              <Text style={styles.selectorText}>{formatFilterDate(startDate)}</Text>
              <Feather name="calendar" size={16} color={colors.mutedForeground} />
            </Pressable>

            <Text style={styles.label}>End Date</Text>
            <Pressable style={styles.selector} onPress={() => setShowEndPicker(true)}>
              <Text style={styles.selectorText}>{formatFilterDate(endDate)}</Text>
              <Feather name="calendar" size={16} color={colors.mutedForeground} />
            </Pressable>
            <View style={styles.filterActions}>
              <Button label="Apply" onPress={() => loadLogs(1)} />
              <Button
                label="Clear"
                variant="secondary"
                onPress={() => {
                  setAction('');
                  setUserId('');
                  setStartDate('');
                  setEndDate('');
                  void loadLogs(1);
                }}
              />
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {loading ? (
              <LoadingState label="Loading audit logs..." />
            ) : error ? (
              <ErrorState title="Unable to load logs" message={error} onAction={() => loadLogs(1)} />
            ) : logs.length === 0 ? (
              <EmptyState title="No logs yet" message="Audit activity will appear here." />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={[styles.tableShell, styles.auditTable]}>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderText, styles.colAction]}>Action</Text>
                    <Text style={[styles.tableHeaderText, styles.colTable]}>Table</Text>
                    <Text style={[styles.tableHeaderText, styles.colRecord]}>Record</Text>
                    <Text style={[styles.tableHeaderText, styles.colUser]}>User</Text>
                    <Text style={[styles.tableHeaderText, styles.colIp]}>IP</Text>
                    <Text style={[styles.tableHeaderText, styles.colTime]}>Time</Text>
                  </View>
                  {logs.map((log) => {
                    const tone = actionTone(log.action);
                    return (
                      <View key={log.id} style={styles.tableRow}>
                        <View style={[styles.tableCell, styles.colAction]}>
                          <View style={[styles.actionBadge, { backgroundColor: tone.bg }]}>
                            <Text style={[styles.actionBadgeText, { color: tone.text }]}>
                              {log.action || '-'}
                            </Text>
                          </View>
                        </View>
                        <View style={[styles.tableCell, styles.colTable]}>
                          <Text style={styles.tableCellText}>{log.table_name || '-'}</Text>
                        </View>
                        <View style={[styles.tableCell, styles.colRecord]}>
                          <Text style={styles.tableCellText}>{log.record_id || '-'}</Text>
                        </View>
                        <View style={[styles.tableCell, styles.colUser]}>
                          <Text style={styles.tableCellText} numberOfLines={1}>
                            {log.user_email || 'System'}
                          </Text>
                        </View>
                        <View style={[styles.tableCell, styles.colIp]}>
                          <Text style={styles.tableCellText}>{log.ip_address || '-'}</Text>
                        </View>
                        <View style={[styles.tableCell, styles.colTime]}>
                          <Text style={styles.tableCellText}>{formatDate(log.created_at)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
            {totalPages > 1 && !loading ? (
              <View style={styles.paginationRow}>
                <Text style={styles.paginationText}>
                  Showing {startItem}-{endItem} of {totalItems}
                </Text>
                <View style={styles.paginationActions}>
                  <Button
                    label="Previous"
                    variant="secondary"
                    onPress={() => loadLogs(page - 1)}
                    disabled={page <= 1}
                    style={styles.paginationButton}
                  />
                  <Button
                    label="Next"
                    onPress={() => loadLogs(page + 1)}
                    disabled={page >= totalPages}
                    style={styles.paginationButton}
                  />
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {showActionPicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Action</Text>
                <Pressable onPress={() => setShowActionPicker(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                {ACTION_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value || 'all'}
                    style={styles.modalRow}
                    onPress={() => {
                      setAction(option.value);
                      setShowActionPicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>{option.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}

        {showUserPicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select User</Text>
                <Pressable onPress={() => setShowUserPicker(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setUserId('');
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
                      setUserId(String(user.id));
                      setShowUserPicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>
                      {user.full_name || user.username || user.email || `User ${user.id}`}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      {showStartPicker ? (
        <DateTimePicker
          value={startDate ? new Date(startDate) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange('start')}
        />
      ) : null}
      {showEndPicker ? (
        <DateTimePicker
          value={endDate ? new Date(endDate) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange('end')}
        />
      ) : null}
    </LinearGradient>
  );
};

export default AuditLogsScreen;

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
  filterCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    gap: 12
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
  inlineHelper: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  filterActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end'
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
  tableShell: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    overflow: 'hidden'
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  tableHeaderText: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  tableCell: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center'
  },
  tableCellText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  auditTable: {
    minWidth: 760
  },
  colAction: {
    width: 140
  },
  colTable: {
    width: 120
  },
  colRecord: {
    width: 80
  },
  colUser: {
    width: 180
  },
  colIp: {
    width: 140
  },
  colTime: {
    width: 160
  },
  actionBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start'
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '600'
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12
  },
  paginationText: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  paginationActions: {
    flexDirection: 'row',
    gap: 10
  },
  paginationButton: {
    minWidth: 110
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
