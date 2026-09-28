import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Input } from '../components/ui';
import { apiRequest, type ApiError } from '../services/api';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import type { CustomersStackParamList } from '../navigation/CustomersStack';

type SalesExecutive = {
  id: number;
  full_name: string;
  email?: string | null;
};

type FormState = {
  name: string;
  email: string;
  phone: string;
  address: string;
  assignedTo: string;
};

const emptyForm: FormState = {
  name: '',
  email: '',
  phone: '',
  address: '',
  assignedTo: ''
};

const sanitizePhone = (value: string) => value.replace(/[^\d]/g, '');

const CustomerFormScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CustomersStackParamList>>();
  const { theme, resolvedMode } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors, resolvedMode === 'light'), [colors, resolvedMode]);
  const { isManagerOrHigher } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [executives, setExecutives] = useState<SalesExecutive[]>([]);
  const [loadingExecutives, setLoadingExecutives] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchExecutives = async () => {
      if (!isManagerOrHigher()) return;
      setLoadingExecutives(true);
      try {
        const data = await apiRequest<{ users?: SalesExecutive[] }>('/users');
        if (!isMounted) return;
        setExecutives(data.users || []);
      } catch (err) {
        // Ignore load errors; assignment is optional
      } finally {
        if (isMounted) {
          setLoadingExecutives(false);
        }
      }
    };

    void fetchExecutives();
    return () => {
      isMounted = false;
    };
  }, [isManagerOrHigher]);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) {
      nextErrors.name = 'Full name is required.';
    }
    if (!form.email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (form.phone && !/^\d{10}$/.test(sanitizePhone(form.phone))) {
      nextErrors.phone = 'Phone number must be 10 digits.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const assigneeLabel = form.assignedTo
    ? executives.find((exec) => String(exec.id) === form.assignedTo)?.full_name || 'Selected user'
    : 'Unassigned';

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim()
      };
      if (form.phone.trim()) {
        payload.phone = sanitizePhone(form.phone);
      }
      if (form.address.trim()) {
        payload.address = form.address.trim();
      }
      if (isManagerOrHigher() && form.assignedTo) {
        payload.assignedTo = Number(form.assignedTo);
      }

      await apiRequest('/customers', { method: 'POST', body: payload });
      navigation.goBack();
    } catch (err) {
      const apiError = err as ApiError;
      setSubmitError(apiError.message || 'Failed to create customer.');
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
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Add Customer</Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
              Create a new customer profile
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
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Contact Information</Text>
            <View style={styles.field}>
              <Input
                label="Full Name *"
                value={form.name}
                onChangeText={(value) => updateField('name', value)}
                autoCapitalize="words"
                error={errors.name}
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Email *"
                value={form.email}
                onChangeText={(value) => updateField('email', value)}
                keyboardType="email-address"
                autoCapitalize="none"
                error={errors.email}
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Phone"
                value={form.phone}
                onChangeText={(value) => updateField('phone', sanitizePhone(value))}
                keyboardType="number-pad"
                maxLength={10}
                error={errors.phone}
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
              label={saving ? 'Saving...' : 'Create Customer'}
              onPress={handleSubmit}
              loading={saving}
              disabled={saving}
              style={styles.actionButton}
            />
          </View>
        </ScrollView>

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
                    updateField('assignedTo', '');
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
                        updateField('assignedTo', String(exec.id));
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
    </LinearGradient>
  );
};

export default CustomerFormScreen;

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
    justifyContent: 'flex-start'
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
