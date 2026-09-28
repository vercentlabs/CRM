import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { TasksStackParamList } from '../navigation/TasksStack';

type Task = {
  id: number;
  title: string;
  description?: string | null;
  due_date: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assigned_to?: number | null;
};

type SalesExecutive = {
  id: number;
  full_name: string;
  email?: string | null;
};

type FormState = {
  title: string;
  description: string;
  due_date: string;
  priority: Task['priority'];
  status: Task['status'];
  assigned_to: string;
};

const emptyForm: FormState = {
  title: '',
  description: '',
  due_date: '',
  priority: 'medium',
  status: 'pending',
  assigned_to: ''
};

const PRIORITY_OPTIONS = [
  { label: 'Low', value: 'low' as const },
  { label: 'Medium', value: 'medium' as const },
  { label: 'High', value: 'high' as const }
];
const STATUS_OPTIONS = [
  { label: 'Pending', value: 'pending' as const },
  { label: 'In Progress', value: 'in_progress' as const },
  { label: 'Completed', value: 'completed' as const },
  { label: 'Cancelled', value: 'cancelled' as const }
];

const formatDateInput = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 16);
};

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

const TaskFormScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<TasksStackParamList>>();
  const route = useRoute<RouteProp<TasksStackParamList, 'TaskForm'>>();
  const { mode, taskId } = route.params;
  const isEdit = mode === 'edit';
  const { theme, resolvedMode } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors, resolvedMode === 'light'), [colors, resolvedMode]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [initialSnapshot, setInitialSnapshot] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [executives, setExecutives] = useState<SalesExecutive[]>([]);
  const [loadingExecutives, setLoadingExecutives] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | 'datetime' | null>(null);
  const [pickerValue, setPickerValue] = useState<Date>(new Date());

  const title = isEdit ? 'Edit Task' : 'Add Task';
  const subtitle = isEdit ? 'Update task details and assignments' : 'Create a new task';

  const loadTask = useCallback(async () => {
    if (!taskId) {
      setLoadError('Task id is missing.');
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ tasks?: Task[] }>('/tasks');
      const found = data.tasks?.find((task) => task.id === taskId);
      if (!found) {
        setLoadError('Task not found.');
        return;
      }
      const next: FormState = {
        title: found.title,
        description: found.description || '',
        due_date: formatDateInput(found.due_date),
        priority: found.priority || 'medium',
        status: found.status || 'pending',
        assigned_to: found.assigned_to ? String(found.assigned_to) : ''
      };
      setForm(next);
      setInitialSnapshot(next);
    } catch (err) {
      const apiError = err as ApiError;
      setLoadError(apiError.message || 'Unable to load task.');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (isEdit) {
      void loadTask();
    } else {
      setForm(emptyForm);
      setInitialSnapshot(null);
      setLoadError(null);
      setSubmitError(null);
    }
  }, [isEdit, loadTask]);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingExecutives(true);
      try {
        const data = await apiRequest<{ users?: SalesExecutive[] }>('/users');
        setExecutives(data.users || []);
      } catch (err) {
        // Ignore load errors
      } finally {
        setLoadingExecutives(false);
      }
    };
    void fetchUsers();
  }, []);

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

  const priorityLabel =
    PRIORITY_OPTIONS.find((option) => option.value === form.priority)?.label || 'Medium';
  const statusLabel =
    STATUS_OPTIONS.find((option) => option.value === form.status)?.label || 'Pending';
  const assigneeLabel = form.assigned_to
    ? executives.find((exec) => String(exec.id) === form.assigned_to)?.full_name || 'Selected user'
    : 'Unassigned';

  const openDateTimePicker = () => {
    const base = form.due_date ? new Date(form.due_date) : new Date();
    setPickerValue(Number.isNaN(base.getTime()) ? new Date() : base);
    if (Platform.OS === 'android') {
      setPickerMode('date');
    } else {
      setPickerMode('datetime');
    }
  };

  const handlePickerChange = (_event: unknown, selected?: Date) => {
    if (Platform.OS === 'android') {
      if (( _event as { type?: string })?.type === 'dismissed') {
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
        updateField('due_date', next.toISOString());
      }
      return;
    }

    if (selected) {
      setPickerValue(selected);
      updateField('due_date', selected.toISOString());
    }
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.title.trim()) {
      nextErrors.title = 'Title is required.';
    }
    if (!form.due_date) {
      nextErrors.due_date = 'Due date is required.';
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
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date,
        priority: form.priority,
        status: form.status,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null
      };

      if (isEdit) {
        if (!taskId) {
          throw new Error('Task id missing.');
        }
        await apiRequest(`/tasks/${taskId}`, { method: 'PATCH', body: payload });
      } else {
        await apiRequest('/tasks', { method: 'POST', body: payload });
      }
      navigation.goBack();
    } catch (err) {
      const apiError = err as ApiError;
      setSubmitError(apiError.message || 'Failed to save task.');
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
            <LoadingState label="Loading task..." />
          ) : loadError ? (
            <ErrorState title="Unable to load task" message={loadError} onAction={loadTask} />
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
                  Task Information
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
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    Due Date *
                  </Text>
                  <Pressable style={styles.selector} onPress={openDateTimePicker}>
                    <Text style={styles.selectorText}>{formatDateDisplay(form.due_date)}</Text>
                    <Feather name="calendar" size={16} color={colors.mutedForeground} />
                  </Pressable>
                  {errors.due_date ? (
                    <Text style={[styles.inlineError, { color: colors.destructive }]}>
                      {errors.due_date}
                    </Text>
                  ) : null}
                </View>
              </Card>

              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Priority and Status
                </Text>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Priority</Text>
                <Pressable style={styles.selector} onPress={() => setShowPriorityPicker(true)}>
                  <Text style={styles.selectorText}>{priorityLabel}</Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </Pressable>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Status</Text>
                <Pressable style={styles.selector} onPress={() => setShowStatusPicker(true)}>
                  <Text style={styles.selectorText}>{statusLabel}</Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </Pressable>
              </Card>

              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Assignment</Text>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Assign To</Text>
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

              <View style={styles.actionsRow}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => navigation.goBack()}
                  style={styles.actionButton}
                />
                <Button
                  label={saving ? 'Saving...' : isEdit ? 'Update Task' : 'Create Task'}
                  onPress={handleSubmit}
                  loading={saving}
                  disabled={saving || (isEdit && !hasChanges)}
                  style={styles.actionButton}
                />
              </View>
            </>
          )}
        </ScrollView>

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
                {PRIORITY_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={styles.modalRow}
                    onPress={() => {
                      updateField('priority', option.value);
                      setShowPriorityPicker(false);
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
                {STATUS_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={styles.modalRow}
                    onPress={() => {
                      updateField('status', option.value);
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

export default TaskFormScreen;

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
  },
  modalEmpty: {
    color: colors.mutedForeground,
    fontSize: 12,
    paddingVertical: 12,
    textAlign: 'center'
  }
});
