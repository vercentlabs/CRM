import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { Button, ErrorState, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';

type AdminStats = {
  totalUsers: number;
  activeUsers: number;
  totalLeads: number;
  totalCustomers: number;
  systemStatus: string;
};

const tools = [
  { title: 'Team Management', screen: 'Users', icon: 'users', color: '#3b82f6' },
  { title: 'System Settings', screen: 'Settings', icon: 'settings', color: '#8b5cf6' },
  { title: 'Audit Logs', screen: 'AuditLogs', icon: 'activity', color: '#22c55e' },
  { title: 'Locations', screen: 'Locations', icon: 'map-pin', color: '#ef4444' },
  { title: 'Reports', screen: 'Reports', icon: 'bar-chart-2', color: '#f97316' },
  { title: 'Calls', screen: 'Calls', icon: 'phone-call', color: '#06b6d4' },
  { title: 'Lead Messages', screen: 'LeadMessages', icon: 'message-square', color: '#0ea5e9' },
  { title: 'Bulk Messages', screen: 'BulkMessages', icon: 'send', color: '#a855f7' },
  { title: 'Calendar', screen: 'Calendar', icon: 'calendar', color: '#14b8a6' },
  { title: 'Tasks', screen: 'Tasks', icon: 'check-square', color: '#10b981' },
  { title: 'Opportunities', screen: 'Opportunities', icon: 'briefcase', color: '#f59e0b' },
  { title: 'Customers', screen: 'Customers', icon: 'user', color: '#6366f1' },
  { title: 'Follow-ups', screen: 'Followups', icon: 'clipboard', color: '#ec4899' },
  { title: 'Overdue Follow-ups', screen: 'OverdueFollowups', icon: 'alert-triangle', color: '#ef4444' }
];

const AdminScreen = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    activeUsers: 0,
    totalLeads: 0,
    totalCustomers: 0,
    systemStatus: 'operational'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [usersData, leadsData, customersData] = await Promise.all([
        apiRequest<{ users?: { is_active?: boolean }[] }>('/users'),
        apiRequest<{ leads?: unknown[]; pagination?: { totalItems?: number } }>(
          '/leads?page=1&limit=1'
        ),
        apiRequest<{ customers?: unknown[] }>('/customers')
      ]);

      const totalUsers = usersData.users?.length ?? 0;
      const activeUsers = usersData.users?.filter((user) => user.is_active).length ?? 0;
      const totalLeads = leadsData.pagination?.totalItems ?? leadsData.leads?.length ?? 0;
      const totalCustomers = customersData.customers?.length ?? 0;

      setStats({
        totalUsers,
        activeUsers,
        totalLeads,
        totalCustomers,
        systemStatus: 'operational'
      });
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load admin stats.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadStats();
    }, [loadStats])
  );

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search admin tools..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>System Administration</Text>
                <Text style={styles.heroSubtitle}>Monitor the platform and manage tools</Text>
                <View style={styles.heroChip}>
                  <Feather name="shield" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>
                    Status: {stats.systemStatus.toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable style={styles.heroButton} onPress={loadStats}>
                  <Feather name="refresh-cw" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>Refresh</Text>
                </Pressable>
              </View>
            </View>
          </LinearGradient>

          {loading ? (
            <LoadingState label="Loading admin stats..." />
          ) : error ? (
            <ErrorState title="Unable to load admin data" message={error} onAction={loadStats} />
          ) : (
            <>
              <View style={styles.statsGrid}>
                {[
                  { label: 'Total Users', value: stats.totalUsers },
                  { label: 'Active Users', value: stats.activeUsers },
                  { label: 'Total Leads', value: stats.totalLeads },
                  { label: 'Total Customers', value: stats.totalCustomers }
                ].map((item) => (
                  <View key={item.label} style={styles.statCard}>
                    <Text style={styles.statLabel}>{item.label}</Text>
                    <Text style={styles.statValue}>{item.value}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Administration Tools</Text>
                {tools.map((tool) => (
                  <Pressable
                    key={tool.title}
                    style={styles.toolCard}
                    onPress={() => navigation.navigate(tool.screen)}
                  >
                    <View style={[styles.toolIcon, { backgroundColor: `${tool.color}33` }]}>
                      <Feather name={tool.icon as any} size={16} color={tool.color} />
                    </View>
                    <View style={styles.toolInfo}>
                      <Text style={styles.toolTitle}>{tool.title}</Text>
                      <Text style={styles.toolSubtitle}>Access {tool.title.toLowerCase()}</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color="#9aa1b5" />
                  </Pressable>
                ))}
              </View>

              <View style={styles.actionRow} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default AdminScreen;

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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16
  },
  statCard: {
    flexBasis: '48%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border
  },
  statLabel: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  statValue: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6
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
  toolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  toolIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  toolInfo: {
    flex: 1
  },
  toolTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '600'
  },
  toolSubtitle: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 2
  },
  actionRow: {
    marginBottom: 24
  }
});
