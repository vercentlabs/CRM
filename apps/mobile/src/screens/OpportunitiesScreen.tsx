import React, {useCallback, useEffect, useState, useMemo} from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import type { OpportunitiesStackParamList, OpportunitySummary } from '../navigation/OpportunitiesStack';

type OpportunityResponse = {
  opportunities?: OpportunitySummary[];
  pagination?: {
    page?: number;
    limit?: number;
    totalItems?: number;
    total?: number;
    totalPages?: number;
  };
};

const stageColors: Record<string, { bg: string; text: string }> = {
  Prospecting: { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' },
  Qualification: { bg: 'rgba(99, 102, 241, 0.2)', text: '#a5b4fc' },
  'Needs Analysis': { bg: 'rgba(14, 165, 233, 0.2)', text: '#38bdf8' },
  'Value Proposition': { bg: 'rgba(16, 185, 129, 0.2)', text: '#34d399' },
  Proposal: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
  Negotiation: { bg: 'rgba(249, 115, 22, 0.2)', text: '#fb923c' },
  'Closed Won': { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' },
  'Closed Lost': { bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171' }
};

const OpportunitiesScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<OpportunitiesStackParamList>>();
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, isSales, isManagerOrHigher } = useAuth();
  const [opportunities, setOpportunities] = useState<OpportunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const loadOpportunities = useCallback(
    async (pageToLoad: number) => {
      setError(null);
      if (pageToLoad === 1) {
        setLoading(true);
      }
      try {
        const data = await apiRequest<OpportunityResponse>(
          `/opportunities?page=${pageToLoad}&limit=${limit}`
        );
        const list = data.opportunities || [];
        const filteredList =
          isSales() && user?.id
            ? list.filter((opportunity) => opportunity.assigned_to === user.id)
            : list;
        const pagination = data.pagination || {};
        const total = pagination.totalItems ?? pagination.total ?? list.length;
        const totalPagesNext =
          pagination.totalPages ?? Math.max(1, Math.ceil(total / (pagination.limit || limit)));
        const totalForView = isSales() ? filteredList.length : total;
        const totalPagesForView = isSales()
          ? Math.max(1, Math.ceil(totalForView / limit))
          : totalPagesNext;
        setOpportunities(filteredList);
        setTotalItems(totalForView);
        setTotalPages(totalPagesForView);
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError.message || 'Failed to load opportunities.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [limit, isSales, user?.id]
  );

  useEffect(() => {
    void loadOpportunities(page);
  }, [page, reloadKey, loadOpportunities]);

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    setReloadKey((prev) => prev + 1);
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    setPage(nextPage);
  };

  const handleExport = async () => {
    if (!isManagerOrHigher()) {
      setExportError('You do not have permission to export opportunities.');
      return;
    }
    setExportError(null);
    setExporting(true);
    try {
      const csv = await apiRequest<string>('/reports/export-opportunities-csv', {
        headers: { Accept: 'text/csv' }
      });
      await Share.share({ message: csv, title: 'Opportunities Export' });
    } catch (err) {
      const apiError = err as ApiError;
      setExportError(apiError.message || 'Failed to export opportunities.');
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (value?: number | null) => {
    if (value === null || value === undefined) return '-';
    return `INR ${Number(value).toLocaleString('en-IN')}`;
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search opportunities..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Opportunities</Text>
                <Text style={styles.heroSubtitle}>Track your pipeline and revenue impact</Text>
                <View style={styles.heroChip}>
                  <Feather name="briefcase" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{totalItems} Total Opportunities</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable style={styles.heroButton} onPress={handleRefresh} disabled={refreshing}>
                  <Feather name="refresh-cw" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>
                    {refreshing ? 'Refreshing' : 'Refresh'}
                  </Text>
                </Pressable>
                {isManagerOrHigher() ? (
                  <Pressable style={styles.heroButton} onPress={handleExport} disabled={exporting}>
                    <Feather name="download" size={12} color="#ffffff" />
                    <Text style={styles.heroButtonText}>
                      {exporting ? 'Exporting' : 'Export'}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.heroPrimaryButton}
                  onPress={() => navigation.navigate('OpportunityForm', { mode: 'create' })}
                >
                  <Feather name="plus" size={12} color="#4f46e5" />
                  <Text style={styles.heroPrimaryText}>Add Opportunity</Text>
                </Pressable>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Pipeline</Text>
            {exportError ? <Text style={styles.inlineError}>{exportError}</Text> : null}
            {loading ? (
              <LoadingState label="Loading opportunities..." />
            ) : error ? (
              <ErrorState
                title="Unable to load opportunities"
                message={error}
                onAction={handleRefresh}
              />
            ) : opportunities.length === 0 ? (
              <EmptyState
                title="No opportunities found"
                message="Add an opportunity to start tracking your pipeline."
                actionLabel="Add Opportunity"
                onAction={() => navigation.navigate('OpportunityForm', { mode: 'create' })}
              />
            ) : (
              <>
                {opportunities.map((opportunity) => {
                  const stageLabel = opportunity.stage || 'Prospecting';
                  const stageStyle = stageColors[stageLabel] || stageColors.Prospecting;
                  const isAssignedToUser = opportunity.assigned_to === user?.id;
                  const canEdit =
                    isManagerOrHigher() || (isSales() && isAssignedToUser);

                  return (
                    <View key={opportunity.id} style={styles.opportunityCard}>
                      <View style={styles.opportunityHeader}>
                        <View style={styles.opportunityTitle}>
                          <Text style={styles.opportunityName}>{opportunity.title}</Text>
                          <Text style={styles.opportunityMeta}>
                            {opportunity.lead_name || 'Lead'} | {opportunity.lead_email || 'No email'}
                          </Text>
                        </View>
                        <View style={[styles.stageChip, { backgroundColor: stageStyle.bg }]}>
                          <Text style={[styles.stageChipText, { color: stageStyle.text }]}>
                            {stageLabel}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.opportunityRow}>
                        <View>
                          <Text style={styles.opportunityLabel}>Value</Text>
                          <Text style={styles.opportunityValue}>
                            {formatCurrency(opportunity.value)}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.opportunityLabel}>Probability</Text>
                          <Text style={styles.opportunityValue}>
                            {opportunity.probability !== null && opportunity.probability !== undefined
                              ? `${opportunity.probability}%`
                              : '-'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.opportunityRow}>
                        <View>
                          <Text style={styles.opportunityLabel}>Expected Close</Text>
                          <Text style={styles.opportunityValue}>
                            {formatDate(opportunity.expected_close_date)}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.opportunityLabel}>Owner</Text>
                          <Text style={styles.opportunityValue}>
                            {opportunity.assigned_to_name || 'Unassigned'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.actionRow}>
                        <Button
                          label="View"
                          variant="secondary"
                          size="sm"
                          onPress={() =>
                            navigation.navigate('OpportunityDetails', { opportunity })
                          }
                          style={styles.actionButton}
                        />
                        {canEdit ? (
                          <Button
                            label="Edit"
                            variant="secondary"
                            size="sm"
                            onPress={() =>
                              navigation.navigate('OpportunityForm', {
                                mode: 'edit',
                                opportunityId: opportunity.id
                              })
                            }
                            style={styles.actionButton}
                          />
                        ) : null}
                      </View>
                    </View>
                  );
                })}

                <View style={styles.paginationRow}>
                  <Text style={styles.paginationText}>
                    Showing {(page - 1) * limit + 1}-{Math.min(page * limit, totalItems)} of{' '}
                    {totalItems}
                  </Text>
                  <View style={styles.paginationActions}>
                    <Button
                      label="Previous"
                      variant="secondary"
                      onPress={() => handlePageChange(page - 1)}
                      disabled={page <= 1}
                      style={styles.paginationButton}
                    />
                    <Button
                      label="Next"
                      onPress={() => handlePageChange(page + 1)}
                      disabled={page >= totalPages}
                      style={styles.paginationButton}
                    />
                  </View>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default OpportunitiesScreen;

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
  heroPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#ffffff'
  },
  heroPrimaryText: {
    color: '#4f46e5',
    fontSize: 10,
    fontWeight: '700'
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
  opportunityCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg
  },
  opportunityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10
  },
  opportunityTitle: {
    flex: 1
  },
  opportunityName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700'
  },
  opportunityMeta: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 2
  },
  stageChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  stageChipText: {
    fontSize: 11,
    fontWeight: '600'
  },
  opportunityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  opportunityLabel: {
    color: colors.mutedForeground,
    fontSize: 10
  },
  opportunityValue: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8
  },
  actionButton: {
    flex: 1
  },
  paginationRow: {
    marginTop: 12,
    gap: 10
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
    flex: 1
  },
  inlineError: {
    color: '#f87171',
    fontSize: 11,
    marginBottom: 8
  }
});
