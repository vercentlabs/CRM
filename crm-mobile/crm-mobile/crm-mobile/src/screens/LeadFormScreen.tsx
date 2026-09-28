import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Card, Chip, ErrorState, Input, LoadingState } from '../components/ui';
import { apiRequest, type ApiError } from '../services/api';
import { emitLeadsRefresh } from '../services/leadEvents';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import type { LeadsStackParamList } from '../navigation/LeadsStack';

type LeadDetail = {
  id: number;
  full_name: string;
  mobile_number?: string | null;
  alternate_number?: string | null;
  email?: string | null;
  address?: string | null;
  source?: string | null;
  notes?: string | null;
  status?: string | null;
  next_call_at?: string | null;
  assigned_to?: number | null;
  age?: number | null;
  occupation?: string | null;
  monthly_income?: number | null;
  is_aware_of_digital_gold?: boolean;
};

type SalesExecutive = {
  id: number;
  full_name: string;
  email?: string | null;
  role_id?: number | null;
  roleId?: number | null;
  role?: { id?: number | null; name?: string | null };
};

type FormState = {
  full_name: string;
  mobile_number: string;
  alternate_number: string;
  email: string;
  address: string;
  source: string;
  notes: string;
  status: string;
  next_call_at: string;
  assigned_to: string;
  age: string;
  occupation: string;
  monthly_income: string;
  is_aware_of_digital_gold: boolean;
};

const STATUS_OPTIONS = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];
const SOURCE_OPTIONS = [
  { value: '', label: 'No Source' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'email_campaign', label: 'Email Campaign' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' }
];

const emptyForm: FormState = {
  full_name: '',
  mobile_number: '',
  alternate_number: '',
  email: '',
  address: '',
  source: '',
  notes: '',
  status: 'New',
  next_call_at: '',
  assigned_to: '',
  age: '',
  occupation: '',
  monthly_income: '',
  is_aware_of_digital_gold: false
};

const sanitizePhone = (value: string) => value.replace(/[^\d]/g, '');

const formatDateInput = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 16);
};

const toIsoMaybe = (value: string) => {
  if (!value) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
};

const formatDateDisplay = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const day = parsed.getDate();
  const month = parsed.toLocaleString('en-GB', { month: 'short' });
  const year = parsed.getFullYear();
  const time = parsed.toLocaleString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return `${day} ${month} ${year} ${time}`;
};

const LeadFormScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<LeadsStackParamList>>();
  const route = useRoute<RouteProp<LeadsStackParamList, 'LeadForm'>>();
  const { mode, leadId } = route.params;
  const isEdit = mode === 'edit';
  const { theme, resolvedMode } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors, resolvedMode === 'light'), [colors, resolvedMode]);
  const { isManagerOrHigher } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [initialSnapshot, setInitialSnapshot] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [executives, setExecutives] = useState<SalesExecutive[]>([]);
  const [loadingExecutives, setLoadingExecutives] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | 'datetime' | null>(null);
  const [pickerValue, setPickerValue] = useState<Date>(new Date());

  const title = isEdit ? 'Edit Lead' : 'Add Lead';
  const subtitle = isEdit ? 'Update lead details and follow-ups' : 'Create a new lead for your pipeline';

  const applyLeadToForm = useCallback((leadData: LeadDetail) => {
    const next: FormState = {
      full_name: leadData.full_name || '',
      mobile_number: leadData.mobile_number || '',
      alternate_number: leadData.alternate_number || '',
      email: leadData.email || '',
      address: leadData.address || '',
      source: leadData.source || '',
      notes: leadData.notes || '',
      status: leadData.status || 'New',
      next_call_at: formatDateInput(leadData.next_call_at),
      assigned_to: leadData.assigned_to ? String(leadData.assigned_to) : '',
      age:
        leadData.age !== null && leadData.age !== undefined ? String(leadData.age) : '',
      occupation: leadData.occupation || '',
      monthly_income:
        leadData.monthly_income !== null && leadData.monthly_income !== undefined
          ? String(leadData.monthly_income)
          : '',
      is_aware_of_digital_gold: Boolean(leadData.is_aware_of_digital_gold)
    };

    setForm(next);
    setInitialSnapshot(next);
  }, []);

  const loadLead = useCallback(async () => {
    if (!leadId) {
      setLoadError('Lead id is missing.');
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ lead: LeadDetail }>(`/leads/${leadId}`);
      applyLeadToForm(data.lead);
    } catch (err) {
      const apiError = err as ApiError;
      setLoadError(apiError.message || 'Unable to load lead details.');
    } finally {
      setLoading(false);
    }
  }, [leadId, applyLeadToForm]);

  useEffect(() => {
    if (isEdit) {
      void loadLead();
    } else {
      setForm(emptyForm);
      setInitialSnapshot(null);
      setLoadError(null);
      setSubmitError(null);
    }
  }, [isEdit, loadLead]);

  useEffect(() => {
    const fetchExecutives = async () => {
      if (!isManagerOrHigher()) return;
      setLoadingExecutives(true);
      try {
        const data = await apiRequest<{ users?: SalesExecutive[] }>('/users');
        const filtered = (data.users || []).filter((user) => {
          const roleId = user.roleId ?? user.role_id ?? user.role?.id ?? null;
          const roleName = user.role?.name?.toLowerCase();
          return roleId === 3 || roleName === 'sales';
        });
        setExecutives(filtered);
      } catch (err) {
        // Ignore load errors; assignment can still use manual selection later.
      } finally {
        setLoadingExecutives(false);
      }
    };

    void fetchExecutives();
  }, [isManagerOrHigher]);

  const updateField = (field: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const openDateTimePicker = () => {
    const base = form.next_call_at ? new Date(form.next_call_at) : new Date();
    setPickerValue(Number.isNaN(base.getTime()) ? new Date() : base);
    if (Platform.OS === 'android') {
      setPickerMode('date');
    } else {
      setPickerMode('datetime');
    }
  };

  const handlePickerChange = (_event: unknown, selected?: Date) => {
    if (Platform.OS === 'android') {
      if (!selected) {
        setPickerMode(null);
        return;
      }
      if (pickerMode === 'date') {
        setPickerValue(selected);
        setPickerMode('time');
        return;
      }
      if (pickerMode === 'time') {
        const next = new Date(pickerValue);
        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        setPickerMode(null);
        updateField('next_call_at', next.toISOString());
      }
      return;
    }

    if (selected) {
      setPickerValue(selected);
      updateField('next_call_at', selected.toISOString());
    }
  };

  const hasChanges = useMemo(() => {
    if (!isEdit) return true;
    if (!initialSnapshot) return true;
    return JSON.stringify(form) !== JSON.stringify(initialSnapshot);
  }, [form, initialSnapshot, isEdit]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.full_name.trim()) {
      nextErrors.full_name = 'Full name is required.';
    }

    const mobile = sanitizePhone(form.mobile_number);
    if (!mobile) {
      nextErrors.mobile_number = 'Mobile number is required.';
    } else if (!/^\d{10}$/.test(mobile)) {
      nextErrors.mobile_number = 'Mobile number must be 10 digits.';
    }

    const alternate = sanitizePhone(form.alternate_number);
    if (form.alternate_number && !/^\d{10}$/.test(alternate)) {
      nextErrors.alternate_number = 'Alternate number must be 10 digits.';
    }

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (form.age) {
      const ageValue = Number(form.age);
      if (Number.isNaN(ageValue) || ageValue < 18 || ageValue > 100) {
        nextErrors.age = 'Age must be between 18 and 100.';
      }
    }

    if (form.monthly_income) {
      const incomeValue = Number(form.monthly_income);
      if (Number.isNaN(incomeValue) || incomeValue < 0) {
        nextErrors.monthly_income = 'Monthly income must be a valid number.';
      }
    }

    if (form.status && !STATUS_OPTIONS.includes(form.status)) {
      nextErrors.status = 'Select a valid status.';
    }

    const sourceValues = SOURCE_OPTIONS.map((option) => option.value);
    if (form.source && !sourceValues.includes(form.source)) {
      nextErrors.source = 'Select a valid source.';
    }

    if (form.next_call_at) {
      const parsed = new Date(form.next_call_at);
      if (Number.isNaN(parsed.getTime())) {
        nextErrors.next_call_at = 'Use a valid date (YYYY-MM-DDTHH:mm).';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildCreatePayload = () => {
    const payload: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      mobile_number: sanitizePhone(form.mobile_number),
      is_aware_of_digital_gold: form.is_aware_of_digital_gold
    };

    if (form.alternate_number.trim()) {
      payload.alternate_number = sanitizePhone(form.alternate_number);
    }
    if (form.email.trim()) {
      payload.email = form.email.trim();
    }
    if (form.address.trim()) {
      payload.address = form.address.trim();
    }
    if (form.source) {
      payload.source = form.source;
    }
    if (form.notes.trim()) {
      payload.notes = form.notes.trim();
    }
    if (form.status) {
      payload.status = form.status;
    }
    if (form.next_call_at) {
      payload.next_call_at = toIsoMaybe(form.next_call_at);
    }
    if (form.age) {
      payload.age = Number(form.age);
    }
    if (form.occupation.trim()) {
      payload.occupation = form.occupation.trim();
    }
    if (form.monthly_income) {
      payload.monthly_income = Number(form.monthly_income);
    }
    if (isManagerOrHigher() && form.assigned_to) {
      payload.assigned_to = Number(form.assigned_to);
    }

    return payload;
  };

  const buildUpdatePayload = () => {
    const payload: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      mobile_number: sanitizePhone(form.mobile_number),
      status: form.status || 'New',
      is_aware_of_digital_gold: form.is_aware_of_digital_gold,
      alternate_number: form.alternate_number.trim()
        ? sanitizePhone(form.alternate_number)
        : null,
      email: form.email.trim() ? form.email.trim() : null,
      address: form.address.trim() ? form.address.trim() : null,
      source: form.source || null,
      notes: form.notes.trim() ? form.notes.trim() : null,
      next_call_at: form.next_call_at ? toIsoMaybe(form.next_call_at) : null,
      age: form.age ? Number(form.age) : null,
      occupation: form.occupation.trim() ? form.occupation.trim() : null,
      monthly_income: form.monthly_income ? Number(form.monthly_income) : null
    };

    if (isManagerOrHigher()) {
      payload.assigned_to = form.assigned_to ? Number(form.assigned_to) : null;
    }

    return payload;
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
      if (isEdit) {
        if (!leadId) {
          throw new Error('Lead id missing.');
        }
        const payload = buildUpdatePayload();
        await apiRequest(`/leads/${leadId}`, { method: 'PUT', body: payload });
        emitLeadsRefresh();
        navigation.goBack();
      } else {
        const payload = buildCreatePayload();
        const response = await apiRequest<{ lead?: LeadDetail; leadId?: number }>('/leads', {
          method: 'POST',
          body: payload
        });
        const createdId = response.lead?.id ?? response.leadId;
        emitLeadsRefresh();
        if (createdId) {
          navigation.replace('LeadDetails', { leadId: createdId });
        } else {
          navigation.goBack();
        }
      }
    } catch (err) {
      const apiError = err as ApiError;
      setSubmitError(apiError.message || 'Failed to save lead.');
    } finally {
      setSaving(false);
    }
  };

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
            <LoadingState label="Loading lead..." />
          ) : loadError ? (
            <ErrorState title="Unable to load lead" message={loadError} onAction={loadLead} />
          ) : (
            <>
              {submitError ? (
                <View style={[styles.errorBanner, { borderColor: colors.destructive }]}>
                  <Text style={[styles.errorText, { color: colors.destructive }]}>
                    {submitError}
                  </Text>
                </View>
              ) : null}

              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Contact Information
                </Text>
                <View style={styles.field}>
                  <Input
                    label="Full Name *"
                    value={form.full_name}
                    onChangeText={(value) => updateField('full_name', value)}
                    autoCapitalize="words"
                    error={errors.full_name}
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Mobile Number *"
                    value={form.mobile_number}
                    onChangeText={(value) => updateField('mobile_number', sanitizePhone(value))}
                    keyboardType="number-pad"
                    maxLength={10}
                    error={errors.mobile_number}
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Alternate Number"
                    value={form.alternate_number}
                    onChangeText={(value) => updateField('alternate_number', sanitizePhone(value))}
                    keyboardType="number-pad"
                    maxLength={10}
                    error={errors.alternate_number}
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Email"
                    value={form.email}
                    onChangeText={(value) => updateField('email', value)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    error={errors.email}
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Address"
                    value={form.address}
                    onChangeText={(value) => updateField('address', value)}
                    multiline
                    style={styles.multilineInput}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Source</Text>
                  <Pressable style={styles.selector} onPress={() => setShowSourcePicker(true)}>
                    <Text style={styles.selectorText}>
                      {SOURCE_OPTIONS.find((option) => option.value === form.source)?.label ||
                        'No Source'}
                    </Text>
                    <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                  </Pressable>
                  {errors.source ? (
                    <Text style={[styles.inlineError, { color: colors.destructive }]}>
                      {errors.source}
                    </Text>
                  ) : null}
                </View>
              </Card>

              {isManagerOrHigher() ? (
                <Card style={styles.card}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Assignment</Text>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Assign To</Text>
                  <Pressable
                    style={styles.selector}
                    onPress={() => setShowAssigneePicker(true)}
                    disabled={loadingExecutives}
                  >
                    <Text style={styles.selectorText}>
                      {form.assigned_to
                        ? executives.find((exec) => String(exec.id) === form.assigned_to)
                            ?.full_name || 'Selected user'
                        : 'Unassigned'}
                    </Text>
                    <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                  </Pressable>
                  {loadingExecutives ? (
                    <Text style={[styles.loadingInline, { color: colors.mutedForeground }]}>
                      Loading...
                    </Text>
                  ) : null}
                </Card>
              ) : null}

              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Status and Follow-up
                </Text>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Status</Text>
                  <Pressable style={styles.selector} onPress={() => setShowStatusPicker(true)}>
                    <Text style={styles.selectorText}>{form.status || 'New'}</Text>
                    <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                  </Pressable>
                  {errors.status ? (
                    <Text style={[styles.inlineError, { color: colors.destructive }]}>
                      {errors.status}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    Next Call
                  </Text>
                  <Pressable style={styles.dateField} onPress={openDateTimePicker}>
                    <Text style={styles.dateValue}>
                      {form.next_call_at
                        ? formatDateDisplay(form.next_call_at)
                        : 'Select date & time'}
                    </Text>
                    <Feather name="calendar" size={16} color={colors.mutedForeground} />
                  </Pressable>
                  {errors.next_call_at ? (
                    <Text style={[styles.inlineError, { color: colors.destructive }]}>
                      {errors.next_call_at}
                    </Text>
                  ) : null}
                </View>
              </Card>

              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Additional Information
                </Text>
                <View style={styles.field}>
                  <Input
                    label="Age"
                    value={form.age}
                    onChangeText={(value) => updateField('age', value)}
                    keyboardType="number-pad"
                    error={errors.age}
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Occupation"
                    value={form.occupation}
                    onChangeText={(value) => updateField('occupation', value)}
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Monthly Income"
                    value={form.monthly_income}
                    onChangeText={(value) => updateField('monthly_income', value)}
                    keyboardType="decimal-pad"
                    error={errors.monthly_income}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    Aware of Digital Gold
                  </Text>
                  <View style={styles.inlineRow}>
                    <Chip
                      label="Yes"
                      active={form.is_aware_of_digital_gold === true}
                      onPress={() => updateField('is_aware_of_digital_gold', true)}
                    />
                    <Chip
                      label="No"
                      active={form.is_aware_of_digital_gold === false}
                      onPress={() => updateField('is_aware_of_digital_gold', false)}
                    />
                  </View>
                </View>
                <View style={styles.field}>
                  <Input
                    label="Notes"
                    value={form.notes}
                    onChangeText={(value) => updateField('notes', value)}
                    multiline
                    style={styles.multilineInput}
                  />
                </View>
              </Card>

              <View style={styles.actionsRow}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => navigation.goBack()}
                  style={styles.actionButton}
                />
                <Button
                  label={saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Lead'}
                  onPress={handleSubmit}
                  loading={saving}
                  disabled={saving || (isEdit && !hasChanges)}
                  style={styles.actionButton}
                />
              </View>
            </>
          )}
        </ScrollView>

        {showSourcePicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Source</Text>
                <Pressable onPress={() => setShowSourcePicker(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                {SOURCE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={styles.modalRow}
                    onPress={() => {
                      updateField('source', option.value);
                      setShowSourcePicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>{option.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}

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
                {STATUS_OPTIONS.map((status) => (
                  <Pressable
                    key={status}
                    style={styles.modalRow}
                    onPress={() => {
                      updateField('status', status);
                      setShowStatusPicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>{status}</Text>
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
                {executives.map((exec) => (
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
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      {pickerMode ? (
        <DateTimePicker
          value={pickerValue}
          mode={pickerMode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handlePickerChange}
        />
      ) : null}
    </LinearGradient>
  );
};

export default LeadFormScreen;

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
  dateField: {
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
  dateValue: {
    color: colors.foreground,
    fontSize: 12
  },
  inlineError: {
    fontSize: 11
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap'
  },
  multilineInput: {
    height: 92,
    textAlignVertical: 'top'
  },
  loadingInline: {
    fontSize: 11,
    paddingVertical: 6
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
    minWidth: 140
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
  }
});
