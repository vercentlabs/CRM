import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Button, Card, ErrorState, Input, LoadingState } from '../components/ui';
import { apiRequest, type ApiError } from '../services/api';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import type { OpportunitiesStackParamList } from '../navigation/OpportunitiesStack';

type Lead = {
  id: number;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
};

type Opportunity = {
  id: number;
  lead_id: number;
  title: string;
  description?: string | null;
  value?: number | null;
  stage?: string | null;
  probability?: number | null;
  expected_close_date?: string | null;
  assigned_to?: number | null;
};

type SalesExecutive = {
  id: number;
  full_name: string;
  email?: string | null;
};

type FormState = {
  lead_id: string;
  title: string;
  description: string;
  value: string;
  stage: string;
  probability: string;
  expected_close_date: string;
  assigned_to: string;
};

const STAGE_OPTIONS = [
  'Prospecting',
  'Qualification',
  'Needs Analysis',
  'Value Proposition',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost'
];

const emptyForm: FormState = {
  lead_id: '',
  title: '',
  description: '',
  value: '',
  stage: 'Prospecting',
  probability: '',
  expected_close_date: '',
  assigned_to: ''
};

const OpportunityFormScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<OpportunitiesStackParamList>>();
  const route = useRoute<RouteProp<OpportunitiesStackParamList, 'OpportunityForm'>>();
  const { mode, opportunityId } = route.params;
  const isEdit = mode === 'edit';
  const { theme, resolvedMode } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors, resolvedMode === 'light'), [colors, resolvedMode]);
  const { isManagerOrHigher } = useAuth();
  const canAssign = isManagerOrHigher();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [initialSnapshot, setInitialSnapshot] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [executives, setExecutives] = useState<SalesExecutive[]>([]);
  const [loadingExecutives, setLoadingExecutives] = useState(false);
  const [showStagePicker, setShowStagePicker] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [showCloseDatePicker, setShowCloseDatePicker] = useState(false);
  const [closeDateValue, setCloseDateValue] = useState<Date>(new Date());
  const [leadQuery, setLeadQuery] = useState('');
  const hasFetchedExecutives = useRef(false);

  const title = isEdit ? 'Edit Opportunity' : 'Add Opportunity';
  const subtitle = isEdit ? 'Update opportunity details' : 'Create a new opportunity';

  const loadOpportunities = useCallback(async () => {
    if (!opportunityId) {
      setLoadError('Opportunity id is missing.');
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ opportunities?: Opportunity[] }>(
        '/opportunities?page=1&limit=100'
      );
      const found = data.opportunities?.find((item) => item.id === opportunityId);
      if (!found) {
        setLoadError('Opportunity not found.');
        return;
      }
      const next: FormState = {
        lead_id: String(found.lead_id || ''),
        title: found.title || '',
        description: found.description || '',
        value: found.value !== null && found.value !== undefined ? String(found.value) : '',
        stage: found.stage || 'Prospecting',
        probability:
          found.probability !== null && found.probability !== undefined
            ? String(found.probability)
            : '',
        expected_close_date: found.expected_close_date || '',
        assigned_to: found.assigned_to ? String(found.assigned_to) : ''
      };
      setForm(next);
      setInitialSnapshot(next);
    } catch (err) {
      const apiError = err as ApiError;
      setLoadError(apiError.message || 'Unable to load opportunity.');
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    if (isEdit) {
      void loadOpportunities();
    } else {
      setForm(emptyForm);
      setInitialSnapshot(null);
      setLoadError(null);
      setSubmitError(null);
    }
  }, [isEdit, loadOpportunities]);

  useEffect(() => {
    const fetchLeads = async () => {
      setLoadingLeads(true);
      try {
        const data = await apiRequest<{ leads?: Lead[] }>('/leads?limit=100&page=1');
        setLeads(data.leads || []);
      } catch (err) {
        // ignore
      } finally {
        setLoadingLeads(false);
      }
    };

    void fetchLeads();
  }, []);

  useEffect(() => {
    if (!leadQuery && form.lead_id && leads.length > 0) {
      const match = leads.find((lead) => String(lead.id) === form.lead_id);
      if (match) {
        setLeadQuery(match.name || match.full_name || `Lead #${match.id}`);
      }
    }
  }, [form.lead_id, leadQuery, leads]);

  useEffect(() => {
    let isMounted = true;
    const fetchUsers = async () => {
      if (!canAssign || hasFetchedExecutives.current) return;
      setLoadingExecutives(true);
      try {
        const data = await apiRequest<{ users?: SalesExecutive[] }>('/users');
        if (isMounted) {
          setExecutives(data.users || []);
        }
      } catch (err) {
        // ignore
      } finally {
        if (isMounted) {
          setLoadingExecutives(false);
        }
        hasFetchedExecutives.current = true;
      }
    };

    void fetchUsers();
    return () => {
      isMounted = false;
    };
  }, [canAssign]);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const hasChanges = useMemo(() => {
    if (!isEdit) return true;
    if (!initialSnapshot) return true;
    return JSON.stringify(form) !== JSON.stringify(initialSnapshot);
  }, [form, initialSnapshot, isEdit]);

  const stageLabel = form.stage || 'Prospecting';
  const assigneeLabel = form.assigned_to
    ? executives.find((exec) => String(exec.id) === form.assigned_to)?.full_name || 'Selected user'
    : 'Unassigned';
  const closeDateLabel = useMemo(() => {
    if (!form.expected_close_date) return 'Select date';
    const parsed = new Date(form.expected_close_date);
    if (Number.isNaN(parsed.getTime())) return form.expected_close_date;
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [form.expected_close_date]);

  const openCloseDatePicker = () => {
    const base = form.expected_close_date ? new Date(form.expected_close_date) : new Date();
    setCloseDateValue(Number.isNaN(base.getTime()) ? new Date() : base);
    setShowCloseDatePicker(true);
  };

  const handleCloseDateChange = (_event: unknown, selected?: Date) => {
    if (Platform.OS === 'android') {
      if ((_event as { type?: string })?.type === 'dismissed') {
        setShowCloseDatePicker(false);
        return;
      }
    }
    if (selected) {
      const value = selected.toISOString().slice(0, 10);
      updateField('expected_close_date', value);
      setCloseDateValue(selected);
    }
    setShowCloseDatePicker(false);
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.lead_id.trim()) {
      nextErrors.lead_id = 'Lead is required.';
    }
    if (!form.title.trim()) {
      nextErrors.title = 'Title is required.';
    }
    if (form.probability) {
      const value = Number(form.probability);
      if (Number.isNaN(value) || value < 0 || value > 100) {
        nextErrors.probability = 'Probability must be between 0 and 100.';
      }
    }
    if (form.value) {
      const value = Number(form.value);
      if (Number.isNaN(value)) {
        nextErrors.value = 'Value must be a number.';
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (isEdit && !hasChanges) {
      setSubmitError('No changes to save.');
      return;
    }
    setSaving(true);
    setSubmitError(null);

    try {
      const payload: Record<string, unknown> = {
        lead_id: Number(form.lead_id),
        title: form.title.trim(),
        description: form.description.trim() || null,
        value: form.value ? Number(form.value) : null,
        stage: form.stage,
        probability: form.probability ? Number(form.probability) : null,
        expected_close_date: form.expected_close_date || null
      };

      if (!isEdit && isManagerOrHigher() && form.assigned_to) {
        payload.assigned_to = Number(form.assigned_to);
      }

      if (isEdit) {
        if (!opportunityId) {
          throw new Error('Opportunity id missing.');
        }
        const { lead_id, assigned_to, ...updatePayload } = payload;
        await apiRequest(`/opportunities/${opportunityId}`, {
          method: 'PUT',
          body: updatePayload
        });
      } else {
        await apiRequest('/opportunities', { method: 'POST', body: payload });
      }
      navigation.goBack();
    } catch (err) {
      const apiError = err as ApiError;
      setSubmitError(apiError.message || 'Failed to save opportunity.');
    } finally {
      setSaving(false);
    }
  };

  const filteredLeads = useMemo(() => {
    const query = leadQuery.trim().toLowerCase();
    if (!query) return [];
    return leads
      .filter((lead) => {
        const name = (lead.name || lead.full_name || '').toLowerCase();
        return name.includes(query);
      })
      .slice(0, 8);
  }, [leadQuery, leads]);

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
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
              {subtitle}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {loading ? (
            <LoadingState label="Loading opportunity..." />
          ) : loadError ? (
            <ErrorState title="Unable to load opportunity" message={loadError} onAction={loadOpportunities} />
          ) : (
            <>
              {submitError ? (
                <View style={[styles.errorBanner, { borderColor: colors.destructive }]}>
                  <Text style={[styles.errorText, { color: colors.destructive }]}>{submitError}</Text>
                </View>
              ) : null}

              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Lead</Text>
                <Input
                  label="Lead *"
                  value={leadQuery}
                  onChangeText={(value) => {
                    setLeadQuery(value);
                    updateField('lead_id', '');
                  }}
                  error={errors.lead_id}
                />
                {loadingLeads ? (
                  <Text style={[styles.loadingInline, { color: colors.mutedForeground }]}>
                    Loading leads...
                  </Text>
                ) : null}
                {filteredLeads.length > 0 ? (
                  <View style={styles.suggestionList}>
                    {filteredLeads.map((lead) => (
                      <Pressable
                        key={lead.id}
                        style={styles.suggestionItem}
                        onPress={() => {
                          updateField('lead_id', String(lead.id));
                          setLeadQuery(lead.name || lead.full_name || `Lead #${lead.id}`);
                        }}
                      >
                        <Text style={[styles.suggestionText, { color: colors.foreground }]}>
                          {lead.name || lead.full_name || `Lead #${lead.id}`}
                        </Text>
                        {lead.email ? (
                          <Text style={[styles.suggestionMeta, { color: colors.mutedForeground }]}>
                            {lead.email}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </Card>

              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Opportunity Details
                </Text>
                <View style={styles.field}>
                  <Input
                    label="Title *"
                    value={form.title}
                    onChangeText={(value) => updateField('title', value)}
                    error={errors.title}
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Description"
                    value={form.description}
                    onChangeText={(value) => updateField('description', value)}
                    multiline
                    style={styles.multilineInput}
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Value"
                    value={form.value}
                    onChangeText={(value) => updateField('value', value)}
                    keyboardType="numeric"
                    error={errors.value}
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Probability (%)"
                    value={form.probability}
                    onChangeText={(value) => updateField('probability', value)}
                    keyboardType="numeric"
                    error={errors.probability}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    Expected Close Date
                  </Text>
                  <Pressable style={styles.selector} onPress={openCloseDatePicker}>
                    <Text style={styles.selectorText}>{closeDateLabel}</Text>
                    <Feather name="calendar" size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              </Card>

              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Stage</Text>
                <Pressable style={styles.selector} onPress={() => setShowStagePicker(true)}>
                  <Text style={styles.selectorText}>{stageLabel}</Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </Pressable>
              </Card>

              {!isEdit && canAssign ? (
                <Card style={styles.card}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Assignment</Text>
                  <Pressable
                    style={styles.selector}
                    onPress={() => setShowAssigneePicker(true)}
                    disabled={loadingExecutives}
                  >
                    <Text style={styles.selectorText}>{assigneeLabel}</Text>
                    <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                  </Pressable>
                  {loadingExecutives ? (
                    <Text style={[styles.loadingInline, { color: colors.mutedForeground }]}>
                      Loading...
                    </Text>
                  ) : null}
                </Card>
              ) : null}

              <View style={styles.actionsRow}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => navigation.goBack()}
                  style={styles.actionButton}
                />
                <Button
                  label={saving ? 'Saving...' : isEdit ? 'Update Opportunity' : 'Create Opportunity'}
                  onPress={handleSubmit}
                  loading={saving}
                  disabled={saving || (isEdit && !hasChanges)}
                  style={styles.actionButton}
                />
              </View>
            </>
          )}
        </ScrollView>

        {showStagePicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Stage</Text>
                <Pressable onPress={() => setShowStagePicker(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                {STAGE_OPTIONS.map((stage) => (
                  <Pressable
                    key={stage}
                    style={styles.modalRow}
                    onPress={() => {
                      updateField('stage', stage);
                      setShowStagePicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>{stage}</Text>
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
                    updateField('assigned_to', '');
                    setShowAssigneePicker(false);
                  }}
                >
                  <Text style={styles.modalText}>Unassigned</Text>
                </Pressable>
                {executives.length === 0 ? (
                  <Text style={styles.modalEmpty}>No users available</Text>
                ) : (
                  executives.map((exec) => (
                    <Pressable
                      key={exec.id}
                      style={styles.modalRow}
                      onPress={() => {
                        updateField('assigned_to', String(exec.id));
                        setShowAssigneePicker(false);
                      }}
                    >
                      <Text style={styles.modalText}>{exec.full_name}</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      {showCloseDatePicker ? (
        <DateTimePicker
          value={closeDateValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleCloseDateChange}
        />
      ) : null}
    </LinearGradient>
  );
};

export default OpportunityFormScreen;

const createStyles = (colors: ThemeColors, isLight: boolean) =>
  StyleSheet.create({
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
    borderColor: colors.border,
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
    paddingBottom: 32,
    gap: 16
  },
  card: {
    gap: 12
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600'
  },
  field: {
    gap: 6
  },
  label: {
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
  chipScroll: {
    marginBottom: 4
  },
  suggestionList: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  suggestionText: {
    fontSize: 13,
    fontWeight: '600'
  },
  suggestionMeta: {
    marginTop: 4,
    fontSize: 11
  },
  loadingInline: {
    fontSize: 11,
    paddingVertical: 6
  },
  multilineInput: {
    height: 92,
    textAlignVertical: 'top'
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    backgroundColor: `${colors.destructive}1F`
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600'
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end'
  },
  actionButton: {
    minWidth: 160
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: isLight ? 'rgba(15, 23, 42, 0.2)' : 'rgba(15, 23, 42, 0.8)',
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
  },
  modalEmpty: {
    color: colors.mutedForeground,
    fontSize: 12,
    paddingVertical: 12,
    textAlign: 'center'
  }
});
