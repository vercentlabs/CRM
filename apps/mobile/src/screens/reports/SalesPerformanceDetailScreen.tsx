import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { apiRequest, type ApiError } from '../../services/api';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/colors';
import { Button, EmptyState, ErrorState, LoadingState } from '../../components/ui';
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

const SalesPerformanceDetailScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ReportsStackParamList>>();
  const route = useRoute<RouteProp<ReportsStackParamList, 'SalesPerformanceDetail'>>();
  const { userId, userName, userEmail } = route.params;
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [dateRange, setDateRange] = useState('30');
  const [report, setReport] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('days', dateRange);
      params.set('userId', String(userId));
      const data = await apiRequest<ReportRow[]>(
        `/reports/sales-performance?${params.toString()}`
      );
      setReport(Array.isArray(data) && data.length > 0 ? data[0] : null);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load performance details.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, userId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const performanceTone = useMemo(() => {
    const rate = report?.conversionRate ?? 0;
    if (rate >= 20) return { label: 'Excellent', color: '#22c55e' };
    if (rate >= 10) return { label: 'Good', color: '#f59e0b' };
    return { label: 'Needs Improvement', color: '#f87171' };
  }, [report]);

  const insights = useMemo(() => {
    const totalLeads = report?.totalLeads ?? 0;
    const converted = report?.convertedLeads ?? 0;
    const rate = report?.conversionRate ?? 0;

    return [
      {
        title: 'Lead Volume',
        text:
          totalLeads >= 50
            ? 'High volume - strong pipeline coverage.'
            : totalLeads >= 20
            ? 'Moderate volume - steady pipeline.'
            : 'Low volume - focus on lead generation.'
      },
      {
        title: 'Conversion Efficiency',
        text:
          converted >= 10
            ? 'Strong conversion count - keep momentum.'
            : converted >= 5
            ? 'Moderate conversions - optimize follow-up.'
            : 'Few conversions - review sales process.'
      },
      {
        title: 'Performance Trend',
        text:
          rate >= 20
            ? 'Trending upward - excellent results.'
            : rate >= 10
            ? 'Stable performance - consistent results.'
            : 'Requires attention and coaching.'
      }
    ];
  }, [report]);

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Feather name="chevron-left" size={20} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Performance Details</Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>Sales executive summary</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>{report?.name || userName || 'User'}</Text>
                <Text style={styles.heroSubtitle}>{report?.email || userEmail || 'No email available'}</Text>
                <View style={styles.heroChip}>
                  <Feather name="trending-up" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{performanceTone.label}</Text>
                </View>
              </View>
              <Pressable style={styles.heroButton} onPress={loadReport}>
                <Feather name="refresh-cw" size={12} color="#ffffff" />
                <Text style={styles.heroButtonText}>Refresh</Text>
              </Pressable>
            </View>
          </LinearGradient>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Date Range</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {RANGE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setDateRange(option.value)}
                  style={[
                    styles.rangeChip,
                    dateRange === option.value && styles.rangeChipActive
                  ]}
                >
                  <Text
                    style={[
                      styles.rangeChipText,
                      dateRange === option.value && styles.rangeChipTextActive
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {loading ? (
            <LoadingState label="Loading performance..." />
          ) : error ? (
            <ErrorState title="Unable to load details" message={error} onAction={loadReport} />
          ) : !report ? (
            <EmptyState title="No data" message="No performance data available." />
          ) : (
            <>
              <View style={styles.kpiGrid}>
                {[
                  { label: 'Total Leads', value: report.totalLeads },
                  { label: 'Converted', value: report.convertedLeads },
                  { label: 'Conversion %', value: `${report.conversionRate.toFixed(1)}%` },
                  { label: 'Date Range', value: `Last ${dateRange} days` }
                ].map((item) => (
                  <View key={item.label} style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>{item.label}</Text>
                    <Text style={styles.kpiValue}>{item.value}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Conversion Rate</Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(report.conversionRate, 100)}%`,
                        backgroundColor: performanceTone.color
                      }
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {report.conversionRate.toFixed(1)}% conversion rate
                </Text>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Performance Insights</Text>
                {insights.map((insight) => (
                  <View key={insight.title} style={styles.insightCard}>
                    <Text style={styles.insightTitle}>{insight.title}</Text>
                    <Text style={styles.insightText}>{insight.text}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total Leads</Text>
                  <Text style={styles.summaryValue}>{report.totalLeads}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Converted Leads</Text>
                  <Text style={styles.summaryValue}>{report.convertedLeads}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Conversion Rate</Text>
                  <Text style={[styles.summaryValue, { color: performanceTone.color }]}
                  >
                    {report.conversionRate.toFixed(1)}%
                  </Text>
                </View>
              </View>

              <View style={styles.actionsRow}>
                <Button label="Back to Report" variant="secondary" onPress={() => navigation.goBack()} />
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default SalesPerformanceDetailScreen;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitles: {
    flex: 1
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600'
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32
  },
  heroCard: {
    borderRadius: 18,
    padding: 16,
    marginTop: 4,
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
  chipRow: {
    marginBottom: 4
  },
  rangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8
  },
  rangeChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: '#6366f1'
  },
  rangeChipText: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600'
  },
  rangeChipTextActive: {
    color: '#c7d2fe'
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
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.inputBg,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999
  },
  progressText: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 6
  },
  insightCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg
  },
  insightTitle: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  insightText: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 4
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  summaryLabel: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  summaryValue: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  actionsRow: {
    marginBottom: 24
  }
});
