import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { onLeadsRefresh } from '../services/leadEvents';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import type { LeadsStackParamList } from '../navigation/LeadsStack';

const STATUS_FILTERS = ['All', 'New', 'Contacted', 'Qualified', 'Converted', 'Lost'];
const STATUS_OPTIONS = STATUS_FILTERS.map((status) => ({
  label: status === 'All' ? 'All Statuses' : status,
  value: status
}));

type Lead = {
  id: number;
  name: string;
  email?: string | null;
  mobile_number?: string | null;
  alternate_number?: string | null;
  source?: string | null;
  status: string;
  next_call_at?: string | null;
  assigned_to?: number | null;
  assigned_user_name?: string | null;
  monthly_income?: number | null;
  age?: number | null;
  occupation?: string | null;
  address?: string | null;
  notes?: string | null;
  is_aware_of_digital_gold?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LeadResponse = {
  leads: Lead[];
  pagination?: {
    page?: number;
    limit?: number;
    totalItems?: number;
    total?: number;
    hasNextPage?: boolean;
    totalPages?: number;
  };
};

type SalesExecutive = {
  id: number;
  full_name: string;
  email?: string | null;
};

const defaultFilters = {
  status: 'All',
  assignedTo: '',
  dateFrom: '',
  dateTo: ''
};

const statusColors: Record<string, { bg: string; text: string }> = {
  New: { bg: 'rgba(96, 165, 250, 0.2)', text: '#60a5fa' },
  Contacted: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
  Qualified: { bg: 'rgba(139, 92, 246, 0.2)', text: '#a78bfa' },
  Converted: { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' },
  Lost: { bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171' }
};

const LeadsScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isManagerOrHigher } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<LeadsStackParamList>>();
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [viewMode, setViewMode] = useState<'Kanban' | 'Table'>('Kanban');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [reloadKey, setReloadKey] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [executives, setExecutives] = useState<SalesExecutive[]>([]);
  const [loadingExecutives, setLoadingExecutives] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [datePickerField, setDatePickerField] = useState<'from' | 'to' | null>(null);
  const [datePickerValue, setDatePickerValue] = useState<Date>(new Date());

  const groupedLeads = useMemo(() => {
    const groups: Record<string, Lead[]> = {};
    STATUS_FILTERS.filter((status) => status !== 'All').forEach((status) => {
      groups[status] = [];
    });
    leads.forEach((lead) => {
      const status = lead.status || 'New';
      if (!groups[status]) {
        groups[status] = [];
      }
      groups[status].push(lead);
    });
    return groups;
  }, [leads]);

  const activeFilterCount = useMemo(() => {
    return Object.entries(appliedFilters).filter(([key, value]) => {
      if (key === 'status') return value !== 'All';
      return value !== '';
    }).length;
  }, [appliedFilters]);

  const formatSource = (value?: string | null) => {
    if (!value) return 'Unknown source';
    return value
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const formatCurrency = (value?: number | null) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '-';
    }
    return `INR ${Number(value).toLocaleString('en-IN')}`;
  };

  const formatLeadName = (name?: string | null) => {
    if (!name) return '-';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return parts[0] || '-';
    return `${parts[0]} ${parts[parts.length - 1]}`;
  };

  const formatNextCall = (value?: string | null) => {
    if (!value) return 'Not scheduled';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const parseDateValue = (value?: string | null) => {
    if (!value) return null;
    const parts = value.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts.map((part) => Number(part));
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const fallback = new Date(value);
    if (!Number.isNaN(fallback.getTime())) return fallback;
    return null;
  };

  const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateDisplay = (value?: string | null) => {
    if (!value) return 'Select date';
    const parsed = parseDateValue(value);
    if (!parsed) return value;
    const day = parsed.getDate();
    const month = parsed.toLocaleString('en-GB', { month: 'short' });
    const year = parsed.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const formatAware = (value?: boolean | null) => {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    return '-';
  };

  const loadLeads = useCallback(
    async (pageToLoad: number) => {
      setError(null);
      if (pageToLoad === 1) {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        if (appliedFilters.status !== 'All') {
          params.append('status', appliedFilters.status);
        }
        if (appliedFilters.assignedTo) {
          params.append('assignedTo', appliedFilters.assignedTo);
        }
        if (appliedFilters.dateFrom) {
          params.append('dateFrom', appliedFilters.dateFrom);
        }
        if (appliedFilters.dateTo) {
          params.append('dateTo', appliedFilters.dateTo);
        }
        params.append('page', String(pageToLoad));
        params.append('limit', String(limit));

        const data = await apiRequest<LeadResponse>(`/leads?${params.toString()}`);
        const nextLeads = data.leads ?? [];
        const pagination = data.pagination ?? {};
        const nextTotal = pagination.totalItems ?? pagination.total ?? nextLeads.length;
        const nextTotalPages =
          pagination.totalPages ??
          Math.max(1, Math.ceil(nextTotal / (pagination.limit || limit)));

        setTotalItems(nextTotal);
        setTotalPages(nextTotalPages);
        setLeads(nextLeads);
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError.message || 'Failed to load leads.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [appliedFilters, limit]
  );

  useEffect(() => {
    void loadLeads(page);
  }, [appliedFilters, page, reloadKey, loadLeads]);

  useEffect(() => {
    const unsubscribe = onLeadsRefresh(() => {
      setRefreshing(true);
      setPage(1);
      setReloadKey((prev) => prev + 1);
    });
    return unsubscribe;
  }, [loadLeads]);

  useEffect(() => {
    const fetchExecutives = async () => {
      if (!isManagerOrHigher()) return;
      setLoadingExecutives(true);
      try {
        const data = await apiRequest<{ users?: SalesExecutive[] }>('/users');
        setExecutives(data.users || []);
      } catch (err) {
        // Ignore errors; filters will still work without executive list
      } finally {
        setLoadingExecutives(false);
      }
    };

    void fetchExecutives();
  }, [isManagerOrHigher]);

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    setReloadKey((prev) => prev + 1);
  };

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedFilters(draftFilters);
  };

  const handleResetFilters = () => {
    setPage(1);
    setDraftFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    setPage(nextPage);
  };

  const handleExport = async () => {
    if (!isManagerOrHigher()) {
      setExportError('You do not have permission to export leads.');
      return;
    }
    setExportError(null);
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (appliedFilters.status !== 'All') {
        params.append('status', appliedFilters.status);
      }
      if (appliedFilters.assignedTo) {
        params.append('assignedTo', appliedFilters.assignedTo);
      }
      if (appliedFilters.dateFrom) {
        params.append('dateFrom', appliedFilters.dateFrom);
      }
      if (appliedFilters.dateTo) {
        params.append('dateTo', appliedFilters.dateTo);
      }
      const query = params.toString();
      const csv = await apiRequest<string>(
        `/reports/export-leads-csv${query ? `?${query}` : ''}`,
        {
        headers: { Accept: 'text/csv' }
        }
      );
      await Share.share({ message: csv, title: 'Leads Export' });
    } catch (err) {
      const apiError = err as ApiError;
      setExportError(apiError.message || 'Failed to export leads.');
    } finally {
      setExporting(false);
    }
  };

  const openDatePicker = (field: 'from' | 'to') => {
    const currentValue =
      field === 'from' ? draftFilters.dateFrom : draftFilters.dateTo;
    const parsed = parseDateValue(currentValue);
    setDatePickerValue(parsed || new Date());
    setDatePickerField(field);
  };

  const handleDateChange = (event: unknown, selected?: Date) => {
    if (Platform.OS === 'android') {
      if ((event as { type?: string })?.type === 'dismissed') {
        setDatePickerField(null);
        return;
      }
    }

    if (!selected) {
      setDatePickerField(null);
      return;
    }

    const formatted = formatDateKey(selected);
    setDatePickerValue(selected);
    setDraftFilters((prev) => ({
      ...prev,
      dateFrom: datePickerField === 'from' ? formatted : prev.dateFrom,
      dateTo: datePickerField === 'to' ? formatted : prev.dateTo
    }));
    setDatePickerField(null);
  };

  const handleViewLead = (leadId: number) => {
    navigation.navigate('LeadDetails', { leadId });
  };

  const handleEditLead = (leadId: number) => {
    navigation.navigate('LeadForm', { mode: 'edit', leadId });
  };

  const handleCallLead = (leadId: number) => {
    navigation.navigate('LeadDetails', { leadId, autoCall: true });
  };

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Leads</Text>
                <Text style={styles.heroSubtitle}>Manage and track your sales leads</Text>
                <View style={styles.heroChip}>
                  <Feather name="clipboard" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{totalItems} Total Leads</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable style={styles.heroButton} onPress={handleRefresh} disabled={refreshing}>
                  <Feather name="refresh-cw" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>{refreshing ? 'Refreshing' : 'Refresh'}</Text>
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
                  onPress={() => navigation.navigate('LeadForm', { mode: 'create' })}
                >
                  <Feather name="plus" size={12} color="#4f46e5" />
                  <Text style={styles.heroPrimaryText}>Add Lead</Text>
                </Pressable>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.filterCard}>
            <View style={styles.filterHeader}>
              <View style={styles.filterTitleRow}>
                <Feather name="filter" size={14} color="#94a3b8" />
                <Text style={styles.filterTitle}>Filter Leads</Text>
              </View>
              <Text style={styles.filterBadge}>{activeFilterCount} Active</Text>
            </View>

            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Status</Text>
              <Pressable style={styles.selector} onPress={() => setShowStatusPicker(true)}>
                <Text style={styles.selectorText}>
                  {draftFilters.status === 'All' ? 'All Statuses' : draftFilters.status}
                </Text>
                <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {isManagerOrHigher() && (
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Assigned To</Text>
                <Pressable
                  style={styles.selector}
                  onPress={() => setShowAssigneePicker(true)}
                  disabled={loadingExecutives}
                >
                  <Text style={styles.selectorText}>
                    {draftFilters.assignedTo
                      ? executives.find((exec) => String(exec.id) === draftFilters.assignedTo)
                          ?.full_name || 'Selected user'
                      : 'All Sales Executives'}
                  </Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </Pressable>
                {loadingExecutives ? <Text style={styles.loadingInline}>Loading...</Text> : null}
              </View>
            )}

            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Date Range</Text>
              <View style={styles.dateRow}>
                <Pressable style={styles.dateSelector} onPress={() => openDatePicker('from')}>
                  <Text style={styles.dateLabel}>From</Text>
                  <View style={styles.dateValueRow}>
                    <Text style={styles.dateValue}>
                      {formatDateDisplay(draftFilters.dateFrom)}
                    </Text>
                    <Feather name="calendar" size={14} color={colors.mutedForeground} />
                  </View>
                </Pressable>
                <Pressable style={styles.dateSelector} onPress={() => openDatePicker('to')}>
                  <Text style={styles.dateLabel}>To</Text>
                  <View style={styles.dateValueRow}>
                    <Text style={styles.dateValue}>
                      {formatDateDisplay(draftFilters.dateTo)}
                    </Text>
                    <Feather name="calendar" size={14} color={colors.mutedForeground} />
                  </View>
                </Pressable>
              </View>
            </View>

            <View style={styles.viewToggle}>
              {(['Kanban', 'Table'] as const).map((mode) => (
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
                    {mode}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.filterActions}>
              <Button label="Reset" variant="secondary" onPress={handleResetFilters} />
              <Button label="Apply Filters" onPress={handleApplyFilters} />
            </View>
            {exportError ? <Text style={styles.inlineError}>{exportError}</Text> : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Leads List</Text>
            {loading ? (
              <LoadingState label="Loading leads..." />
            ) : error ? (
              <ErrorState title="Unable to load leads" message={error} onAction={handleRefresh} />
            ) : leads.length === 0 ? (
              <EmptyState
                title="No leads found"
                message="Adjust your filters or add a new lead."
                actionLabel="Refresh"
                onAction={handleRefresh}
              />
            ) : (
              <>
                {viewMode === 'Table' ? (
                    <View style={[styles.tableShell, styles.leadsTable]}>
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.tableHeaderText, styles.colLeadName]}>Lead Name</Text>
                        <Text style={[styles.tableHeaderText, styles.colActions]}>Actions</Text>
                      </View>
                      {leads.map((lead) => {
                        const hasPhone = Boolean(lead.mobile_number || lead.alternate_number);
                        return (
                          <Pressable
                            key={lead.id}
                            style={styles.tableRow}
                            onPress={() => handleViewLead(lead.id)}
                          >
                            <View style={[styles.tableCell, styles.colLeadName]}>
                              <Text style={styles.tableCellText} numberOfLines={1}>
                                {formatLeadName(lead.name)}
                              </Text>
                            </View>
                            <View style={[styles.tableCell, styles.colActions]}>
                              <View style={styles.actionRow}>
                                <Pressable
                                  style={[styles.actionIcon, !hasPhone && styles.actionIconDisabled]}
                                  onPress={() => handleCallLead(lead.id)}
                                  disabled={!hasPhone}
                                >
                                  <Feather name="phone-call" size={14} color="#22c55e" />
                                </Pressable>
                                <Pressable
                                  style={styles.actionIcon}
                                  onPress={() => handleViewLead(lead.id)}
                                >
                                  <Feather name="eye" size={14} color="#93c5fd" />
                                </Pressable>
                                <Pressable
                                  style={styles.actionIcon}
                                  onPress={() => handleEditLead(lead.id)}
                                >
                                  <Feather name="edit-3" size={14} color="#fbbf24" />
                                </Pressable>
                              </View>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kanbanScroll}>
                    {STATUS_FILTERS.filter((status) => status !== 'All').map((status) => {
                      const columnLeads = groupedLeads[status] || [];
                      const chip = statusColors[status] || statusColors.New;
                      return (
                        <View key={status} style={styles.kanbanColumn}>
                          <View style={styles.kanbanHeader}>
                            <Text style={styles.kanbanTitle}>{status}</Text>
                            <View style={[styles.statusChip, { backgroundColor: chip.bg }]}>
                              <Text style={[styles.statusChipText, { color: chip.text }]}>
                                {columnLeads.length}
                              </Text>
                            </View>
                          </View>
                          {columnLeads.length === 0 ? (
                            <Text style={styles.kanbanEmpty}>No leads</Text>
                          ) : (
                            columnLeads.map((lead) => {
                              const statusChip = statusColors[lead.status] || statusColors.New;
                              const hasPhone = Boolean(lead.mobile_number || lead.alternate_number);
                              return (
                                <Pressable
                                  key={lead.id}
                                  style={styles.kanbanCard}
                                  onPress={() => handleViewLead(lead.id)}
                                >
                                  <View style={styles.kanbanCardHeader}>
                                    <View>
                                      <Text style={styles.kanbanLead} numberOfLines={1}>
                                        {formatLeadName(lead.name)}
                                      </Text>
                                      <Text style={styles.kanbanMeta} numberOfLines={1}>
                                        {lead.mobile_number || lead.email || 'No contact'}
                                      </Text>
                                    </View>
                                    <View style={[styles.statusChip, { backgroundColor: statusChip.bg }]}>
                                      <Text
                                        style={[styles.statusChipText, { color: statusChip.text }]}
                                      >
                                        {lead.status}
                                      </Text>
                                    </View>
                                  </View>
                                  <View style={styles.kanbanRow}>
                                    <Text style={styles.kanbanLabel}>Source</Text>
                                    <Text style={styles.kanbanValue} numberOfLines={1}>
                                      {formatSource(lead.source)}
                                    </Text>
                                  </View>
                                  <View style={styles.kanbanRow}>
                                    <Text style={styles.kanbanLabel}>Assigned</Text>
                                    <Text style={styles.kanbanValue} numberOfLines={1}>
                                      {lead.assigned_user_name || 'Unassigned'}
                                    </Text>
                                  </View>
                                  <View style={styles.kanbanRow}>
                                    <Text style={styles.kanbanLabel}>Next Call</Text>
                                    <Text style={styles.kanbanValue} numberOfLines={1}>
                                      {formatNextCall(lead.next_call_at)}
                                    </Text>
                                  </View>
                                  <View style={styles.kanbanRow}>
                                    <Text style={styles.kanbanLabel}>Income</Text>
                                    <Text style={styles.kanbanValue} numberOfLines={1}>
                                      {formatCurrency(lead.monthly_income ?? null)}
                                    </Text>
                                  </View>
                                  <View style={styles.kanbanActions}>
                                    <Pressable
                                      style={[
                                        styles.actionIcon,
                                        styles.actionIconSmall,
                                        !hasPhone && styles.actionIconDisabled
                                      ]}
                                      onPress={() => handleCallLead(lead.id)}
                                      disabled={!hasPhone}
                                    >
                                      <Feather name="phone-call" size={12} color="#22c55e" />
                                    </Pressable>
                                    <View style={styles.kanbanActionSpacer} />
                                    <Pressable
                                      style={[styles.actionIcon, styles.actionIconSmall]}
                                      onPress={() => handleViewLead(lead.id)}
                                    >
                                      <Feather name="eye" size={12} color="#93c5fd" />
                                    </Pressable>
                                    <Pressable
                                      style={[styles.actionIcon, styles.actionIconSmall]}
                                      onPress={() => handleEditLead(lead.id)}
                                    >
                                      <Feather name="edit-3" size={12} color="#fbbf24" />
                                    </Pressable>
                                  </View>
                                </Pressable>
                              );
                            })
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                )}

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

        {showStatusPicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Status</Text>
                <Pressable onPress={() => setShowStatusPicker(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                {STATUS_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={styles.modalRow}
                    onPress={() => {
                      setDraftFilters((prev) => ({ ...prev, status: option.value }));
                      setShowStatusPicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>{option.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}

        {showAssigneePicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Assign To</Text>
                <Pressable onPress={() => setShowAssigneePicker(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setDraftFilters((prev) => ({ ...prev, assignedTo: '' }));
                    setShowAssigneePicker(false);
                  }}
                >
                  <Text style={styles.modalText}>All Sales Executives</Text>
                </Pressable>
                {executives.map((exec) => (
                  <Pressable
                    key={exec.id}
                    style={styles.modalRow}
                    onPress={() => {
                      setDraftFilters((prev) => ({ ...prev, assignedTo: String(exec.id) }));
                      setShowAssigneePicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>{exec.full_name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}

        {datePickerField ? (
          <DateTimePicker
            value={datePickerValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
          />
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  );
};

export default LeadsScreen;

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
  filterCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  filterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  filterTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '600'
  },
  filterBadge: {
    color: '#8b5cf6',
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999
  },
  filterGroup: {
    marginBottom: 12
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
  filterLabel: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8
  },
  dateRow: {
    flexDirection: 'column',
    gap: 12
  },
  dateSelector: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.inputBg
  },
  dateLabel: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6
  },
  dateValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  dateValue: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  loadingInline: {
    color: colors.mutedForeground,
    fontSize: 11,
    paddingVertical: 6
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 12
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: colors.inputBg
  },
  toggleButtonActive: {
    backgroundColor: colors.brand
  },
  toggleText: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600'
  },
  toggleTextActive: {
    color: colors.primaryForeground
  },
  filterActions: {
    flexDirection: 'row',
    gap: 10
  },
  inlineError: {
    color: colors.destructive,
    fontSize: 11,
    marginTop: 8
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
  leadsTable: {
    width: '100%'
  },
  colLeadName: {
    width: 200
  },
  colActions: {
    width: 120
  },
  leadCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.muted
  },
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  leadName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700'
  },
  leadCompany: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 2
  },
  statusChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '600'
  },
  leadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  leadMetaLabel: {
    color: colors.mutedForeground,
    fontSize: 10
  },
  leadMetaValue: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3
  },
  leadFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  leadFooterText: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  kanbanScroll: {
    marginBottom: 12
  },
  kanbanColumn: {
    width: 220,
    marginRight: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card
  },
  kanbanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  kanbanTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '700'
  },
  kanbanEmpty: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  kanbanCard: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    marginBottom: 8
  },
  kanbanCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8
  },
  kanbanLead: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  kanbanMeta: {
    color: colors.mutedForeground,
    fontSize: 10,
    marginTop: 4
  },
  kanbanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6
  },
  kanbanLabel: {
    color: colors.mutedForeground,
    fontSize: 10
  },
  kanbanValue: {
    color: colors.foreground,
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 110,
    textAlign: 'right'
  },
  kanbanActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10
  },
  kanbanActionSpacer: {
    flex: 1
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  actionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg
  },
  actionIconSmall: {
    width: 26,
    height: 26,
    borderRadius: 7
  },
  actionIconDisabled: {
    opacity: 0.4
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
