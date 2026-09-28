import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Button, Card, ErrorState, Input, LoadingState } from '../components/ui';
import { apiRequest, type ApiError } from '../services/api';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import type { UsersStackParamList } from '../navigation/UsersStack';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '../config/constants';

type UserRecord = {
  id: number;
  full_name?: string | null;
  email: string;
  username?: string | null;
  role_id?: number;
  roleId?: number;
  mobile_number?: string | null;
  is_active?: boolean;
};

type FormState = {
  full_name: string;
  email: string;
  mobile_number: string;
  role_id: number;
  password: string;
};

const emptyForm: FormState = {
  full_name: '',
  email: '',
  mobile_number: '',
  role_id: ROLE_SALES,
  password: ''
};

const ROLE_OPTIONS = [
  { label: 'Admin', value: ROLE_ADMIN },
  { label: 'Manager', value: ROLE_MANAGER },
  { label: 'Sales', value: ROLE_SALES }
];

const sanitizePhone = (value: string) => value.replace(/[^\d]/g, '');

const UserFormScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<UsersStackParamList>>();
  const route = useRoute<RouteProp<UsersStackParamList, 'UserForm'>>();
  const { mode, userId } = route.params;
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
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const title = isEdit ? 'Edit User' : 'Add User';
  const subtitle = isEdit ? 'Update user details and role' : 'Create a new team member';

  const loadUsers = useCallback(async () => {
    if (!userId) {
      setLoadError('User id is missing.');
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ users?: UserRecord[] }>('/users');
      const found = data.users?.find((user) => user.id === userId);
      if (!found) {
        setLoadError('User not found.');
        return;
      }
      const next: FormState = {
        full_name: found.full_name || found.username || '',
        email: found.email || '',
        mobile_number: found.mobile_number || '',
        role_id: found.roleId ?? found.role_id ?? ROLE_SALES,
        password: ''
      };
      setForm(next);
      setInitialSnapshot(next);
    } catch (err) {
      const apiError = err as ApiError;
      setLoadError(apiError.message || 'Unable to load user.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isEdit) {
      void loadUsers();
    } else {
      setForm(emptyForm);
      setInitialSnapshot(null);
      setLoadError(null);
      setSubmitError(null);
    }
  }, [isEdit, loadUsers]);

  const updateField = (field: keyof FormState, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as string]) {
      setErrors((prev) => ({ ...prev, [field as string]: '' }));
    }
  };

  const hasChanges = useMemo(() => {
    if (!isEdit) return true;
    if (!initialSnapshot) return true;
    return JSON.stringify(form) !== JSON.stringify(initialSnapshot);
  }, [form, initialSnapshot, isEdit]);

  const roleLabel = useMemo(() => {
    return ROLE_OPTIONS.find((option) => option.value === form.role_id)?.label || 'Sales';
  }, [form.role_id]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.full_name.trim()) {
      nextErrors.full_name = 'Full name is required.';
    }
    if (!form.email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = 'Enter a valid email address.';
    }
    const phone = sanitizePhone(form.mobile_number);
    if (!phone) {
      nextErrors.mobile_number = 'Mobile number is required.';
    } else if (phone.length < 10) {
      nextErrors.mobile_number = 'Mobile number must be at least 10 digits.';
    }
    if (!isEdit && !form.password.trim()) {
      nextErrors.password = 'Password is required.';
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
      if (isEdit) {
        if (!userId) {
          throw new Error('User id missing.');
        }
        const payload = {
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          role_id: form.role_id,
          mobile_number: sanitizePhone(form.mobile_number)
        };
        await apiRequest(`/users/${userId}`, { method: 'PUT', body: payload });
      } else {
        const payload = {
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          password: form.password.trim(),
          roleId: form.role_id,
          mobile_number: sanitizePhone(form.mobile_number)
        };
        await apiRequest('/users', { method: 'POST', body: payload });
      }
      navigation.goBack();
    } catch (err) {
      const apiError = err as ApiError;
      setSubmitError(apiError.message || 'Failed to save user.');
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
            <LoadingState label="Loading user..." />
          ) : loadError ? (
            <ErrorState title="Unable to load user" message={loadError} onAction={loadUsers} />
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
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Profile</Text>
                <View style={styles.field}>
                  <Input
                    label="Full Name *"
                    value={form.full_name}
                    onChangeText={(value) => updateField('full_name', value)}
                    error={errors.full_name}
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
                    label="Mobile Number *"
                    value={form.mobile_number}
                    onChangeText={(value) => updateField('mobile_number', sanitizePhone(value))}
                    keyboardType="number-pad"
                    error={errors.mobile_number}
                  />
                </View>
                {!isEdit ? (
                  <View style={styles.field}>
                    <Input
                      label="Password *"
                      value={form.password}
                      onChangeText={(value) => updateField('password', value)}
                      secureTextEntry={!showPassword}
                      rightIcon={
                        <Feather
                          name={showPassword ? 'eye-off' : 'eye'}
                          size={16}
                          color={colors.mutedForeground}
                        />
                      }
                      onRightPress={() => setShowPassword((prev) => !prev)}
                      error={errors.password}
                    />
                  </View>
                ) : null}
              </Card>

              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Role</Text>
                <Pressable style={styles.selector} onPress={() => setShowRolePicker(true)}>
                  <Text style={styles.selectorText}>{roleLabel}</Text>
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
                  label={saving ? 'Saving...' : isEdit ? 'Update User' : 'Create User'}
                  variant="primary"
                  onPress={handleSubmit}
                  loading={saving}
                  disabled={saving || (isEdit && !hasChanges)}
                  style={styles.actionButton}
                />
              </View>
            </>
          )}
        </ScrollView>

        {showRolePicker ? (
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Role</Text>
                <Pressable onPress={() => setShowRolePicker(false)}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList}>
                {ROLE_OPTIONS.map((role) => (
                  <Pressable
                    key={role.value}
                    style={styles.modalRow}
                    onPress={() => {
                      updateField('role_id', role.value);
                      setShowRolePicker(false);
                    }}
                  >
                    <Text style={styles.modalText}>{role.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  );
};

export default UserFormScreen;

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
    minWidth: 140,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
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
