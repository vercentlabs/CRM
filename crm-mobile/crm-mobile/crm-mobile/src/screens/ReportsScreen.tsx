import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppTopbar from '../components/AppTopbar';
import { Button, EmptyState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '../config/constants';
import type { ReportsStackParamList } from '../navigation/ReportsStack';

type ReportCard = {
  title: string;
  description: string;
  category: string;
  icon: keyof typeof Feather.glyphMap;
  route: keyof ReportsStackParamList;
  roles: number[];
};

const REPORT_CARDS: ReportCard[] = [
  {
    title: 'Sales Performance',
    description:
      'Track individual and team sales metrics, conversion rates, and performance trends over time.',
    category: 'Sales',
    icon: 'bar-chart-2',
    route: 'SalesPerformance',
    roles: [ROLE_ADMIN, ROLE_MANAGER]
  },
  {
    title: 'Lead Aging',
    description:
      'Analyze how long leads remain in your pipeline to identify bottlenecks and improve conversion.',
    category: 'Leads',
    icon: 'clock',
    route: 'LeadAging',
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    title: 'Conversion Funnel',
    description:
      'Visualize lead movement across stages to identify conversion bottlenecks and optimization opportunities.',
    category: 'Leads',
    icon: 'trending-up',
    route: 'ConversionReport',
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  }
];

const ReportsScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<ReportsStackParamList>>();
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);

  const reports = useMemo(() => {
    const roleId = user?.roleId ?? ROLE_SALES;
    return REPORT_CARDS.filter((report) => report.roles.includes(roleId));
  }, [user?.roleId]);

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search reports..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Reports</Text>
                <Text style={styles.heroSubtitle}>Insights for sales and lead performance</Text>
                <View style={styles.heroChip}>
                  <Feather name="file-text" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{reports.length} Reports</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable style={styles.heroButton}>
                  <Feather name="refresh-cw" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>Refresh</Text>
                </Pressable>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Available Reports</Text>
            {loading ? (
              <Text style={styles.loadingText}>Loading reports...</Text>
            ) : error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : reports.length === 0 ? (
              <EmptyState
                title="No reports available"
                message="You do not have access to any reports yet."
              />
            ) : (
              reports.map((report) => (
                <Pressable
                  key={report.title}
                  style={styles.reportCard}
                  onPress={() => navigation.navigate(report.route)}
                >
                  <View style={styles.reportHeader}>
                    <View style={styles.reportIcon}>
                      <Feather name={report.icon} size={18} color="#4f46e5" />
                    </View>
                    <View style={styles.reportInfo}>
                      <Text style={styles.reportTitle}>{report.title}</Text>
                      <View style={styles.reportCategory}>
                        <Text style={styles.reportCategoryText}>{report.category}</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.reportDescription}>{report.description}</Text>
                  <View style={styles.reportActionRow}>
                    <Button
                      label="View Report"
                      size="sm"
                      onPress={() => navigation.navigate(report.route)}
                    />
                    <Text style={styles.reportHint}>Tap to open</Text>
                  </View>
                </Pressable>
              ))
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Report Tips</Text>
            <View style={styles.tipRow}>
              <Text style={styles.tipTitle}>Filter your data</Text>
              <Text style={styles.tipBody}>
                Use date range and user filters to focus on specific time periods or team members.
              </Text>
            </View>
            <View style={styles.tipRow}>
              <Text style={styles.tipTitle}>Export for analysis</Text>
              <Text style={styles.tipBody}>
                Download reports as CSV files for deeper analysis in Excel or other tools.
              </Text>
            </View>
            <View style={styles.tipRow}>
              <Text style={styles.tipTitle}>Track trends</Text>
              <Text style={styles.tipBody}>
                Monitor key metrics over time to identify patterns and make data-driven decisions.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default ReportsScreen;

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
  loadingText: {
    color: colors.mutedForeground,
    fontSize: 12
  },
  errorText: {
    color: '#f87171',
    fontSize: 12
  },
  reportCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  reportIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79, 70, 229, 0.12)'
  },
  reportInfo: {
    flex: 1
  },
  reportTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700'
  },
  reportCategory: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(99, 102, 241, 0.2)'
  },
  reportCategoryText: {
    color: '#c7d2fe',
    fontSize: 10,
    fontWeight: '600'
  },
  reportDescription: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 8
  },
  reportActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10
  },
  reportHint: {
    color: colors.mutedForeground,
    fontSize: 10
  },
  tipRow: {
    marginBottom: 12
  },
  tipTitle: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4
  },
  tipBody: {
    color: colors.mutedForeground,
    fontSize: 11
  }
});
