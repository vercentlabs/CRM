import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Svg, { Path, Circle } from 'react-native-svg';
import AppTopbar from '../components/AppTopbar';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { apiRequest, type ApiError } from '../services/api';
import { ErrorState, LoadingState } from '../components/ui';

const STATUS_COLORS: Record<string, string> = {
  New: '#3b82f6',
  Contacted: '#8b5cf6',
  Qualified: '#10b981',
  Converted: '#22c55e',
  Lost: '#ef4444'
};

type LeadStatusCount = {
  status: string;
  count: number | string;
};

type DashboardSummary = {
  totalLeads: number;
  leadsByStatus: LeadStatusCount[];
  pendingFollowups: number;
  overdueFollowups: number;
  callsToday: number;
  messagesToday: number;
};

type LeadsOverTimePoint = {
  time: string;
  leads: number;
};

type TimeFilter = 'Today' | 'This Week' | 'This Month';

type LeadsOverTimeByPeriod = Record<TimeFilter, LeadsOverTimePoint[]>;

type RecentLead = {
  id: number;
  name: string;
  status: string;
  mobile_number?: string | null;
  email?: string | null;
  source?: string | null;
  created_at?: string | null;
  assigned_to?: number | null;
  assigned_user_name?: string | null;
};

type SalesExecutive = {
  id: number;
  name: string;
  email: string;
  totalLeads: number;
  convertedLeads: number;
  conversionRate: number;
};

type GoldRateResponse = {
  updated_at?: string;
  gold_24k?: Record<string, number>;
  gold_22k?: Record<string, number>;
  source?: string;
  warning?: string | boolean;
};

const TIME_FILTERS: TimeFilter[] = ['Today', 'This Week', 'This Month'];

const STATUS_BADGES: Record<string, { bg: string; text: string }> = {
  New: { bg: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6' },
  Contacted: { bg: 'rgba(139, 92, 246, 0.2)', text: '#8b5cf6' },
  Qualified: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' },
  Converted: { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' },
  Lost: { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' }
};

const formatRelativeTime = (dateString?: string | null) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
};

const formatSource = (source?: string | null) => {
  if (!source) return 'N/A';
  const cleaned = source.replace(/_/g, ' ').trim();
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
};

const buildLinePath = (values: number[], width: number, height: number, padding: number) => {
  if (values.length === 0) return '';
  if (values.length === 1) {
    const x = width / 2;
    const y = height / 2;
    return `M ${x} ${y}`;
  }
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;

  return values
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / (values.length - 1);
      const y = padding + ((maxValue - value) / range) * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
};

const buildAreaPath = (values: number[], width: number, height: number, padding: number) => {
  if (values.length === 0) return '';
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;
  const points = values.map((value, index) => {
    const x =
      values.length === 1
        ? width / 2
        : padding + (index * (width - padding * 2)) / (values.length - 1);
    const y = padding + ((maxValue - value) / range) * (height - padding * 2);
    return { x, y };
  });

  const baseY = height - padding;
  const pointPath = points.map((point) => `${point.x} ${point.y}`).join(' L ');
  return `M ${points[0].x} ${baseY} L ${pointPath} L ${points[points.length - 1].x} ${baseY} Z`;
};

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
};

const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
};

const HomeScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width - 72, 320);
  const chartHeight = 140;
  const chartPadding = 12;
  const donutSize = 150;
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [leadsOverTimeByPeriod, setLeadsOverTimeByPeriod] = useState<LeadsOverTimeByPeriod>({
    Today: [],
    'This Week': [],
    'This Month': []
  });
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('This Month');
  const [recentLeads, setRecentLeads] = useState<RecentLead[]>([]);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsPageSize] = useState(10);
  const [leadsPagination, setLeadsPagination] = useState({
    page: 1,
    limit: 10,
    totalItems: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [executives, setExecutives] = useState<SalesExecutive[]>([]);
  const [executivesPage, setExecutivesPage] = useState(1);
  const [executivesPageSize] = useState(8);
  const [goldRates, setGoldRates] = useState<GoldRateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecentLeads = useCallback(
    async (page: number) => {
      setLeadsLoading(true);
      setLeadsError(null);
      try {
        const data = await apiRequest<{
          leads?: RecentLead[];
          pagination?: {
            page: number;
            limit: number;
            totalItems: number;
            totalPages: number;
            hasNextPage: boolean;
            hasPrevPage: boolean;
          };
        }>(`/leads?limit=${leadsPageSize}&page=${page}`);

        setRecentLeads(data.leads || []);
        if (data.pagination) {
          const safeTotalPages = Math.max(1, data.pagination.totalPages || 1);
          const normalized = {
            ...data.pagination,
            totalPages: safeTotalPages,
            page: Math.min(data.pagination.page, safeTotalPages)
          };
          setLeadsPagination(normalized);
          setLeadsPage(normalized.page);
        }
      } catch (err) {
        const apiError = err as ApiError;
        setLeadsError(apiError.message || 'Failed to load recent leads.');
      } finally {
        setLeadsLoading(false);
      }
    },
    [leadsPageSize]
  );

  const loadDashboard = useCallback(async () => {
    setError(null);
    setRefreshing(true);

    const [
      summaryResult,
      leadsTodayResult,
      leadsWeekResult,
      leadsMonthResult,
      executivesResult,
      goldResult
    ] = await Promise.allSettled([
      apiRequest<DashboardSummary>('/reports/dashboard-summary'),
      apiRequest<LeadsOverTimePoint[]>('/reports/leads-over-time?period=today'),
      apiRequest<LeadsOverTimePoint[]>('/reports/leads-over-time?period=week'),
      apiRequest<LeadsOverTimePoint[]>('/reports/leads-over-time?period=month'),
      apiRequest<SalesExecutive[]>('/reports/sales-performance'),
      apiRequest<GoldRateResponse>('/gold/gold-rate')
    ]);

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value);
    } else {
      const apiError = summaryResult.reason as ApiError;
      setError(apiError.message || 'Failed to load dashboard summary.');
    }

    const nextLeadsByPeriod: LeadsOverTimeByPeriod = {
      Today: [],
      'This Week': [],
      'This Month': []
    };

    if (leadsTodayResult.status === 'fulfilled') {
      nextLeadsByPeriod.Today = leadsTodayResult.value || [];
    }

    if (leadsWeekResult.status === 'fulfilled') {
      nextLeadsByPeriod['This Week'] = leadsWeekResult.value || [];
    }

    if (leadsMonthResult.status === 'fulfilled') {
      nextLeadsByPeriod['This Month'] = leadsMonthResult.value || [];
    }

    const hasChartData = Object.values(nextLeadsByPeriod).some((series) => series.length > 0);

    if (!hasChartData) {
      try {
        const fallback = await apiRequest<{ leads?: RecentLead[] }>('/leads?limit=100&page=1');
        const grouped: Record<string, number> = {};
        (fallback.leads || []).forEach((lead) => {
          if (!lead.created_at) return;
          const dateKey = new Date(lead.created_at).toISOString().slice(0, 10);
          grouped[dateKey] = (grouped[dateKey] || 0) + 1;
        });

        const series = Object.entries(grouped)
          .map(([dateKey, count]) => ({
            time: new Date(dateKey).toLocaleDateString(),
            leads: count,
            dateKey
          }))
          .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
          .map(({ time, leads }) => ({ time, leads }));

        nextLeadsByPeriod.Today = series.slice(0, 10);
        nextLeadsByPeriod['This Week'] = series.slice(0, 7);
        nextLeadsByPeriod['This Month'] = series.slice(0, 4);
      } catch {
        // Keep the chart empty if fallback fails.
      }
    }

    setLeadsOverTimeByPeriod(nextLeadsByPeriod);

    if (executivesResult.status === 'fulfilled') {
      setExecutives(executivesResult.value || []);
    }

    if (goldResult.status === 'fulfilled') {
      setGoldRates(goldResult.value);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadRecentLeads(leadsPage);
  }, [loadRecentLeads, leadsPage]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(executives.length / executivesPageSize));
    if (executivesPage > totalPages) {
      setExecutivesPage(totalPages);
    }
  }, [executives.length, executivesPage, executivesPageSize]);

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {
      New: 0,
      Contacted: 0,
      Qualified: 0,
      Converted: 0,
      Lost: 0
    };
    summary?.leadsByStatus?.forEach((item) => {
      const count = typeof item.count === 'string' ? parseInt(item.count, 10) : item.count;
      map[item.status] = Number.isNaN(count) ? 0 : count;
    });
    return map;
  }, [summary]);

  const totalLeads = summary?.totalLeads ?? 0;
  const gold24k = goldRates?.gold_24k?.['1g'];
  const goldLabel = gold24k ? `₹${gold24k.toLocaleString('en-IN')}` : '—';

  const kpiData = useMemo(
    () => [
      { title: 'Total Leads', value: totalLeads.toLocaleString(), color: '#60a5fa', icon: 'users' },
      { title: 'New Leads', value: statusCounts.New.toLocaleString(), color: '#22c55e', icon: 'user-plus' },
      { title: 'Qualified', value: statusCounts.Qualified.toLocaleString(), color: '#8b5cf6', icon: 'check-circle' },
      { title: 'Converted', value: statusCounts.Converted.toLocaleString(), color: '#10b981', icon: 'trending-up' },
      { title: 'Lost', value: statusCounts.Lost.toLocaleString(), color: '#ef4444', icon: 'x-circle' },
      { title: 'Gold 24k / 1g', value: goldLabel, color: '#f59e0b', icon: 'star' }
    ],
    [totalLeads, statusCounts, goldLabel]
  );

  const statusData = useMemo(
    () =>
      ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'].map((status) => ({
        label: status,
        value: statusCounts[status] || 0,
        color: STATUS_COLORS[status] || colors.mutedForeground
      })),
    [statusCounts]
  );

  const currentLeadsOverTime = useMemo(
    () => leadsOverTimeByPeriod[timeFilter] || [],
    [leadsOverTimeByPeriod, timeFilter]
  );

  const chartValues = useMemo(
    () => currentLeadsOverTime.map((item) => item.leads),
    [currentLeadsOverTime]
  );

  const chartLabels = useMemo(
    () => currentLeadsOverTime.map((item) => item.time),
    [currentLeadsOverTime]
  );

  const chartLabelWidth = useMemo(() => {
    return chartLabels.length > 0 ? chartWidth / chartLabels.length : chartWidth;
  }, [chartLabels.length, chartWidth]);

  const linePath = useMemo(
    () => buildLinePath(chartValues, chartWidth, chartHeight, chartPadding),
    [chartValues, chartWidth, chartHeight, chartPadding]
  );

  const areaPath = useMemo(
    () => buildAreaPath(chartValues, chartWidth, chartHeight, chartPadding),
    [chartValues, chartWidth, chartHeight, chartPadding]
  );

  const maxChartValue = chartValues.length ? Math.max(1, ...chartValues) : 0;
  const minChartValue = chartValues.length ? Math.min(...chartValues) : 0;
  const chartRange = maxChartValue - minChartValue || 1;

  const executiveTotalPages = Math.max(1, Math.ceil(executives.length / executivesPageSize));
  const executiveStartIndex = (executivesPage - 1) * executivesPageSize;
  const executiveEndIndex = executiveStartIndex + executivesPageSize;
  const visibleExecutives = executives.slice(executiveStartIndex, executiveEndIndex);

  const leadStartIndex = (leadsPagination.page - 1) * leadsPagination.limit;
  const leadEndIndex = leadStartIndex + recentLeads.length;

  const handleRefresh = async () => {
    await loadDashboard();
    await loadRecentLeads(leadsPage);
  };
  const totalStatus = statusData.reduce((sum, item) => sum + item.value, 0);
  let statusStartAngle = 0;
  const statusArcs =
    totalStatus === 0
      ? []
      : statusData.map((item) => {
          const startAngle = statusStartAngle;
          const endAngle = startAngle + (item.value / totalStatus) * 360;
          statusStartAngle = endAngle;

          return (
            <Path
              key={item.label}
              d={describeArc(donutSize / 2, donutSize / 2, 56, startAngle, endAngle)}
              stroke={item.color}
              strokeWidth={14}
              fill="none"
              strokeLinecap="round"
            />
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
        <AppTopbar />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Dashboard</Text>
                <Text style={styles.heroSubtitle}>Track your leads, conversions, and team performance</Text>
              </View>
              <Pressable style={styles.refreshButton} onPress={handleRefresh} disabled={refreshing}>
                <Feather name="refresh-cw" size={14} color="#ffffff" />
                <Text style={styles.refreshText}>{refreshing ? 'Refreshing' : 'Refresh'}</Text>
              </Pressable>
            </View>
          </LinearGradient>

          {loading ? (
            <LoadingState label="Loading dashboard..." />
          ) : error ? (
            <ErrorState title="Dashboard unavailable" message={error} onAction={loadDashboard} />
          ) : (
            <>
              <View style={styles.kpiGrid}>
                {kpiData.map((item) => (
                  <View key={item.title} style={styles.kpiCard}>
                    <View style={styles.kpiRow}>
                      <View style={styles.kpiText}>
                        <Text style={styles.kpiTitle}>{item.title}</Text>
                        <Text style={styles.kpiValue}>{item.value}</Text>
                      </View>
                      <View style={[styles.kpiIconWrap, { backgroundColor: `${item.color}26` }]}>
                        <Feather name={item.icon as any} size={16} color={item.color} />
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>Leads Over Time</Text>
                  <View style={styles.filterRow}>
                    {TIME_FILTERS.map((filter) => (
                      <Pressable
                        key={filter}
                        onPress={() => setTimeFilter(filter)}
                        style={[
                          styles.filterChip,
                          timeFilter === filter && styles.filterChipActive
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            timeFilter === filter && styles.filterChipTextActive
                          ]}
                        >
                          {filter}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={styles.chartWrap}>
                  {chartValues.length === 0 ? (
                    <Text style={styles.emptyText}>No data available for this period.</Text>
                  ) : (
                    <>
                      <View style={styles.chartBodyRow}>
                        <View style={[styles.chartAxis, { height: chartHeight }]}>
                          <Text style={styles.axisLabel}>{maxChartValue}</Text>
                          <Text style={styles.axisLabel}>{Math.round(maxChartValue / 2)}</Text>
                          <Text style={styles.axisLabel}>0</Text>
                        </View>
                        <Svg width={chartWidth} height={chartHeight}>
                          {areaPath ? (
                            <Path d={areaPath} fill="rgba(139, 92, 246, 0.18)" />
                          ) : null}
                          <Path d={linePath} stroke="#8b5cf6" strokeWidth={2.5} fill="none" />
                          {chartValues.map((value, index) => {
                            const x =
                              chartValues.length === 1
                                ? chartWidth / 2
                                : chartPadding +
                                  (index * (chartWidth - chartPadding * 2)) /
                                    (chartValues.length - 1);
                            const y =
                              chartPadding +
                              ((maxChartValue - value) / chartRange) *
                                (chartHeight - chartPadding * 2);
                            return <Circle key={index} cx={x} cy={y} r={3} fill="#a78bfa" />;
                          })}
                        </Svg>
                      </View>
                      <View style={[styles.chartLabels, { width: chartWidth, marginLeft: 30 }]}>
                        {chartLabels.map((label, index) => (
                          <Text
                            key={`${label}-${index}`}
                            style={[styles.chartLabel, { width: chartLabelWidth }]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {label}
                          </Text>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Lead Status Distribution</Text>
                {totalStatus === 0 ? (
                  <Text style={styles.emptyText}>No lead status data yet.</Text>
                ) : (
                  <View style={styles.statusRow}>
                    <View style={styles.donutWrap}>
                      <Svg width={donutSize} height={donutSize}>
                        {statusArcs}
                        <Circle cx={donutSize / 2} cy={donutSize / 2} r={36} fill={colors.card} />
                      </Svg>
                      <View style={styles.donutCenter}>
                        <Text style={styles.donutValue}>{totalStatus.toLocaleString()}</Text>
                        <Text style={styles.donutLabel}>Total Leads</Text>
                      </View>
                    </View>
                    <View style={styles.statusLegend}>
                      {statusData.map((item) => {
                        const percent = totalStatus > 0 ? (item.value / totalStatus) * 100 : 0;
                        return (
                          <View key={item.label} style={styles.legendRow}>
                            <View style={styles.legendLabel}>
                              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                              <Text style={styles.legendText}>{item.label}</Text>
                            </View>
                            <View style={styles.legendValue}>
                              <Text style={styles.legendCount}>{item.value}</Text>
                              <Text style={styles.legendPercent}>{percent.toFixed(1)}%</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Recent Leads</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={[styles.tableShell, styles.recentLeadsTable]}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.tableHeaderText, styles.colLeadName]}>Lead Name</Text>
                      <Text style={[styles.tableHeaderText, styles.colContact]}>Phone / Email</Text>
                      <Text style={[styles.tableHeaderText, styles.colSource]}>Source</Text>
                      <Text style={[styles.tableHeaderText, styles.colStatus]}>Status</Text>
                      <Text style={[styles.tableHeaderText, styles.colAssigned]}>Assigned To</Text>
                      <Text style={[styles.tableHeaderText, styles.colCreated]}>Created</Text>
                    </View>
                    {leadsLoading ? (
                      <View style={styles.tableEmptyRow}>
                        <Text style={styles.tableEmptyText}>Loading leads...</Text>
                      </View>
                    ) : leadsError ? (
                      <View style={styles.tableEmptyRow}>
                        <Text style={styles.tableEmptyText}>{leadsError}</Text>
                      </View>
                    ) : recentLeads.length === 0 ? (
                      <View style={styles.tableEmptyRow}>
                        <Text style={styles.tableEmptyText}>No recent leads available.</Text>
                      </View>
                    ) : (
                      recentLeads.map((lead) => {
                        const badge = STATUS_BADGES[lead.status] || {
                          bg: 'rgba(148, 163, 184, 0.2)',
                          text: '#94a3b8'
                        };
                        return (
                          <View key={lead.id} style={styles.tableRow}>
                            <View style={[styles.tableCell, styles.colLeadName]}>
                              <Text style={styles.tableCellText} numberOfLines={1}>
                                {lead.name || 'Unnamed'}
                              </Text>
                            </View>
                            <View style={[styles.tableCell, styles.colContact]}>
                              <Text style={styles.tableCellText} numberOfLines={1}>
                                {lead.mobile_number || 'N/A'}
                              </Text>
                              <Text style={styles.tableSubText} numberOfLines={1}>
                                {lead.email || 'N/A'}
                              </Text>
                            </View>
                            <View style={[styles.tableCell, styles.colSource]}>
                              <Text style={styles.tableCellText} numberOfLines={1}>
                                {formatSource(lead.source)}
                              </Text>
                            </View>
                            <View style={[styles.tableCell, styles.colStatus]}>
                              <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
                                <Text style={[styles.statusPillText, { color: badge.text }]}>
                                  {lead.status || 'N/A'}
                                </Text>
                              </View>
                            </View>
                            <View style={[styles.tableCell, styles.colAssigned]}>
                              <Text
                                style={[
                                  styles.tableCellText,
                                  !lead.assigned_to && styles.tableSubtle
                                ]}
                                numberOfLines={1}
                              >
                                {lead.assigned_user_name || 'Unassigned'}
                              </Text>
                            </View>
                            <View style={[styles.tableCell, styles.colCreated]}>
                              <Text style={styles.tableCellText} numberOfLines={1}>
                                {formatRelativeTime(lead.created_at)}
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                </ScrollView>
                <View style={styles.tableFooter}>
                  <Text style={styles.tableFooterText}>
                    Showing {recentLeads.length ? leadStartIndex + 1 : 0} to {leadEndIndex} of{' '}
                    {leadsPagination.totalItems}
                  </Text>
                  <View style={styles.paginationControls}>
                    <Pressable
                      onPress={() => setLeadsPage((prev) => Math.max(1, prev - 1))}
                      disabled={!leadsPagination.hasPrevPage || leadsLoading}
                      style={({ pressed }) => [
                        styles.paginationButton,
                        (!leadsPagination.hasPrevPage || leadsLoading) && styles.paginationButtonDisabled,
                        pressed && styles.paginationButtonPressed
                      ]}
                    >
                      <Text style={styles.paginationButtonText}>Prev</Text>
                    </Pressable>
                    <Text style={styles.paginationLabel}>
                      Page {leadsPagination.page} of {leadsPagination.totalPages}
                    </Text>
                    <Pressable
                      onPress={() =>
                        setLeadsPage((prev) =>
                          Math.min(leadsPagination.totalPages, prev + 1)
                        )
                      }
                      disabled={!leadsPagination.hasNextPage || leadsLoading}
                      style={({ pressed }) => [
                        styles.paginationButton,
                        (!leadsPagination.hasNextPage || leadsLoading) && styles.paginationButtonDisabled,
                        pressed && styles.paginationButtonPressed
                      ]}
                    >
                      <Text style={styles.paginationButtonText}>Next</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Leads by Sales Executive</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={[styles.tableShell, styles.executiveTable]}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.tableHeaderText, styles.colExecName]}>Executive Name</Text>
                      <Text style={[styles.tableHeaderText, styles.colAssignedCount]}>Leads Assigned</Text>
                      <Text style={[styles.tableHeaderText, styles.colContacted]}>Leads Contacted</Text>
                      <Text style={[styles.tableHeaderText, styles.colConversions]}>Conversions</Text>
                      <Text style={[styles.tableHeaderText, styles.colConversionRate]}>Conversion %</Text>
                    </View>
                    {loading ? (
                      <View style={styles.tableEmptyRow}>
                        <Text style={styles.tableEmptyText}>Loading performance...</Text>
                      </View>
                    ) : executives.length === 0 ? (
                      <View style={styles.tableEmptyRow}>
                        <Text style={styles.tableEmptyText}>
                          Team performance data is available for managers and admins.
                        </Text>
                      </View>
                    ) : (
                      visibleExecutives.map((exec) => {
                        const conversionRate = Number.isFinite(exec.conversionRate)
                          ? exec.conversionRate
                          : exec.totalLeads > 0
                            ? (exec.convertedLeads / exec.totalLeads) * 100
                            : 0;
                        const conversionLabel = conversionRate.toFixed(1);
                        const conversionFill = Math.min(100, Math.max(0, conversionRate));
                        return (
                          <View key={exec.id} style={styles.tableRow}>
                            <View style={[styles.tableCell, styles.colExecName]}>
                              <Text style={styles.tableCellText} numberOfLines={1}>
                                {exec.name || 'Unknown'}
                              </Text>
                              <Text style={styles.tableSubText} numberOfLines={1}>
                                {exec.email || 'N/A'}
                              </Text>
                            </View>
                            <View style={[styles.tableCell, styles.colAssignedCount]}>
                              <Text style={styles.tableCellText}>{exec.totalLeads}</Text>
                            </View>
                            <View style={[styles.tableCell, styles.colContacted]}>
                              <Text style={styles.tableCellText}>0</Text>
                            </View>
                            <View style={[styles.tableCell, styles.colConversions]}>
                              <Text style={styles.tableCellText}>{exec.convertedLeads}</Text>
                            </View>
                            <View style={[styles.tableCell, styles.colConversionRate]}>
                              <View style={styles.conversionRow}>
                                <View style={styles.conversionTrack}>
                                  <View
                                    style={[
                                      styles.conversionFill,
                                      { width: `${conversionFill}%` }
                                    ]}
                                  />
                                </View>
                                <Text style={styles.conversionText}>{conversionLabel}%</Text>
                              </View>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                </ScrollView>
                <View style={styles.tableFooter}>
                  <Text style={styles.tableFooterText}>
                    Showing {executives.length ? executiveStartIndex + 1 : 0} to{' '}
                    {Math.min(executiveEndIndex, executives.length)} of {executives.length}
                  </Text>
                  <View style={styles.paginationControls}>
                    <Pressable
                      onPress={() => setExecutivesPage((prev) => Math.max(1, prev - 1))}
                      disabled={executivesPage === 1}
                      style={({ pressed }) => [
                        styles.paginationButton,
                        executivesPage === 1 && styles.paginationButtonDisabled,
                        pressed && styles.paginationButtonPressed
                      ]}
                    >
                      <Text style={styles.paginationButtonText}>Prev</Text>
                    </Pressable>
                    <Text style={styles.paginationLabel}>
                      Page {executivesPage} of {executiveTotalPages}
                    </Text>
                    <Pressable
                      onPress={() =>
                        setExecutivesPage((prev) => Math.min(executiveTotalPages, prev + 1))
                      }
                      disabled={executiveTotalPages === 1 || executivesPage === executiveTotalPages}
                      style={({ pressed }) => [
                        styles.paginationButton,
                        (executiveTotalPages === 1 || executivesPage === executiveTotalPages) &&
                          styles.paginationButtonDisabled,
                        pressed && styles.paginationButtonPressed
                      ]}
                    >
                      <Text style={styles.paginationButtonText}>Next</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default HomeScreen;

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
    alignItems: 'center',
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
  refreshButton: {
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
  refreshText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600'
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
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  kpiText: {
    flex: 1,
    marginRight: 8
  },
  kpiTitle: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  kpiValue: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4
  },
  kpiIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12
  },
  sectionTitleInline: {
    marginBottom: 0
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap'
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted
  },
  filterChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: colors.brand
  },
  filterChipText: {
    color: colors.mutedForeground,
    fontSize: 10,
    fontWeight: '600'
  },
  filterChipTextActive: {
    color: colors.brand
  },
  chartWrap: {
    alignItems: 'flex-start'
  },
  chartBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2
  },
  chartAxis: {
    width: 20,
    justifyContent: 'space-between',
    paddingVertical: 2
  },
  axisLabel: {
    color: colors.mutedForeground,
    fontSize: 10,
    textAlign: 'right'
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 6
  },
  chartLabel: {
    color: colors.mutedForeground,
    fontSize: 10,
    textAlign: 'center'
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  donutWrap: {
    position: 'relative'
  },
  donutCenter: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  donutValue: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '700'
  },
  donutLabel: {
    color: colors.mutedForeground,
    fontSize: 10,
    marginTop: 2
  },
  statusLegend: {
    flex: 1
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  legendLabel: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  legendValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8
  },
  legendText: {
    color: colors.foreground,
    fontSize: 12
  },
  legendCount: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  legendPercent: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  emptyText: {
    color: colors.mutedForeground,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8
  },
  tableShell: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.card
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.muted
  },
  tableHeaderText: {
    color: colors.mutedForeground,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  tableCell: {
    justifyContent: 'center',
    paddingRight: 12
  },
  tableCellText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  tableSubText: {
    color: colors.mutedForeground,
    fontSize: 10,
    marginTop: 2
  },
  tableSubtle: {
    color: colors.mutedForeground
  },
  tableEmptyRow: {
    padding: 16,
    alignItems: 'center'
  },
  tableEmptyText: {
    color: colors.mutedForeground,
    fontSize: 12
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start'
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600'
  },
  recentLeadsTable: {
    minWidth: 760
  },
  executiveTable: {
    minWidth: 720
  },
  colLeadName: {
    width: 160
  },
  colContact: {
    width: 180
  },
  colSource: {
    width: 120
  },
  colStatus: {
    width: 110
  },
  colAssigned: {
    width: 150
  },
  colCreated: {
    width: 120
  },
  colExecName: {
    width: 200
  },
  colAssignedCount: {
    width: 120
  },
  colContacted: {
    width: 120
  },
  colConversions: {
    width: 110
  },
  colConversionRate: {
    width: 170
  },
  conversionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  conversionTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden'
  },
  conversionFill: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.brand
  },
  conversionText: {
    color: colors.foreground,
    fontSize: 11,
    fontWeight: '600',
    width: 48,
    textAlign: 'right'
  },
  tableFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  tableFooterText: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  paginationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  paginationButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg
  },
  paginationButtonPressed: {
    opacity: 0.8
  },
  paginationButtonDisabled: {
    opacity: 0.5
  },
  paginationButtonText: {
    color: colors.foreground,
    fontSize: 11,
    fontWeight: '600'
  },
  paginationLabel: {
    color: colors.mutedForeground,
    fontSize: 11
  }
});
