import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Input } from '../components/ui';
import { apiRequest, type ApiError } from '../services/api';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import type { CalendarStackParamList } from '../navigation/CalendarStack';

type FormState = {
  title: string;
  description: string;
  start_date: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
};

const emptyForm: FormState = {
  title: '',
  description: '',
  start_date: '',
  priority: 'medium',
  status: 'pending'
};

const PRIORITY_OPTIONS: FormState['priority'][] = ['low', 'medium', 'high'];
const STATUS_OPTIONS: FormState['status'][] = ['pending', 'in_progress', 'completed', 'cancelled'];

const formatDateDisplay = (value?: string | null) => {
  if (!value) return 'Select date & time';
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

const CalendarEventFormScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CalendarStackParamList>>();
  const { theme, resolvedMode } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors, resolvedMode === 'light'), [colors, resolvedMode]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | 'datetime' | null>(null);
  const [pickerValue, setPickerValue] = useState<Date>(new Date());
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const priorityLabel = useMemo(() => {
    return form.priority ? form.priority.charAt(0).toUpperCase() + form.priority.slice(1) : 'Medium';
  }, [form.priority]);

  const statusLabel = useMemo(() => {
    return form.status ? form.status.replace('_', ' ') : 'Pending';
  }, [form.status]);

  const openDateTimePicker = () => {
    const base = form.start_date ? new Date(form.start_date) : new Date();
    setPickerValue(Number.isNaN(base.getTime()) ? new Date() : base);
    if (Platform.OS === 'android') {
      setPickerMode('date');
    } else {
      setPickerMode('datetime');
    }
  };

  const handlePickerChange = (_event: unknown, selected?: Date) => {
    if (Platform.OS === 'android') {
      if ((_event as { type?: string })?.type === 'dismissed') {
        setPickerMode(null);
        return;
      }
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
        updateField('start_date', next.toISOString());
      }
      return;
    }

    if (selected) {
      setPickerValue(selected);
      updateField('start_date', selected.toISOString());
    }
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.title.trim()) {
      nextErrors.title = 'Title is required.';
    }
    if (!form.start_date) {
      nextErrors.start_date = 'Start date is required.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await apiRequest('/calendar', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          description: form.description.trim() || null,
          start_date: form.start_date,
          priority: form.priority,
          status: form.status
        }
      });
      navigation.goBack();
    } catch (err) {
      const apiError = err as ApiError;
      setSubmitError(apiError.message || 'Failed to create event.');
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
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Add Event</Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
              Schedule a new calendar event
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {submitError ? (
            <View style={[styles.errorBanner, { borderColor: colors.destructive }]}>
              <Text style={[styles.errorText, { color: colors.destructive }]}>{submitError}</Text>
            </View>
          ) : null}

          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Event Details</Text>
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
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Start Date *</Text>
              <Pressable style={styles.selector} onPress={openDateTimePicker}>
                <Text style={styles.selectorText}>{formatDateDisplay(form.start_date)}</Text>
                <Feather name="calendar" size={16} color={colors.mutedForeground} />
              </Pressable>
              {errors.start_date ? (
                <Text style={[styles.inlineError, { color: colors.destructive }]}>
                  {errors.start_date}
                </Text>
              ) : null}
            </View>
          </Card>

          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Priority</Text>
            <Pressable style={styles.selector} onPress={() => setShowPriorityPicker(true)}>
              <Text style={styles.selectorText}>{priorityLabel}</Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>
          </Card>

          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Status</Text>
            <Pressable style={styles.selector} onPress={() => setShowStatusPicker(true)}>
              <Text style={styles.selectorText}>{statusLabel}</Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>
          </Card>

          <View style={styles.actionsRow}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => navigation.goBack()}
              style={styles.actionButton}
            />
            <Button
              label={saving ? 'Saving...' : 'Create Event'}
              onPress={handleSubmit}
              loading={saving}
              disabled={saving}
              style={styles.actionButton}
            />
          </View>
        </ScrollView>
      </SafeAreaView>

      {pickerMode ? (
        <DateTimePicker
          value={pickerValue}
          mode={pickerMode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handlePickerChange}
        />
      ) : null}

      {showPriorityPicker ? (
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Priority</Text>
              <Pressable onPress={() => setShowPriorityPicker(false)}>
                <Feather name="x" size={18} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalList}>
              {PRIORITY_OPTIONS.map((priority) => (
                <Pressable
                  key={priority}
                  style={styles.modalRow}
                  onPress={() => {
                    updateField('priority', priority);
                    setShowPriorityPicker(false);
                  }}
                >
                  <Text style={styles.modalText}>
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </Text>
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
                  <Text style={styles.modalText}>{status.replace('_', ' ')}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </LinearGradient>
  );
};

export default CalendarEventFormScreen;

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
    inlineError: {
      fontSize: 11
    },
    multilineInput: {
      height: 92,
      textAlignVertical: 'top'
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
    }
  });
