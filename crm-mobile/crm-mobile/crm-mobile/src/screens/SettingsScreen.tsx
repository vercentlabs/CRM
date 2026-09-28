import React, {useCallback, useEffect, useState, useMemo} from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { Button, ErrorState, Input, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '../config/constants';

type SettingsForm = {
  companyName: string;
  defaultRole: string;
  emailFrom: string;
  emailProvider: string;
};

const defaultForm: SettingsForm = {
  companyName: '',
  defaultRole: String(ROLE_SALES),
  emailFrom: '',
  emailProvider: 'smtp'
};

const parseSetting = (value?: string) => {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || parsed === undefined) return '';
    return String(parsed);
  } catch {
    return value;
  }
};

const SettingsScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [form, setForm] = useState<SettingsForm>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const loadSettings = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ settings?: Record<string, string> }>('/settings');
      const settings = data.settings || {};
      setForm({
        companyName: parseSetting(settings.companyName),
        defaultRole: parseSetting(settings.defaultRole) || String(ROLE_SALES),
        emailFrom: parseSetting(settings.emailFrom),
        emailProvider: parseSetting(settings.emailProvider) || 'smtp'
      });
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSuccessMessage('');
    try {
      await apiRequest('/settings', {
        method: 'PATCH',
        body: { settings: { ...form } }
      });
      setSuccessMessage('Settings saved successfully.');
    } catch (err) {
      const apiError = err as ApiError;
      setSaveError(apiError.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof SettingsForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search settings..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Settings</Text>
                <Text style={styles.heroSubtitle}>Configure system-wide preferences</Text>
                <View style={styles.heroChip}>
                  <Feather name="settings" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>Admin Settings</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable style={styles.heroButton} onPress={loadSettings}>
                  <Feather name="refresh-cw" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>Refresh</Text>
                </Pressable>
              </View>
            </View>
          </LinearGradient>

          {loading ? (
            <LoadingState label="Loading settings..." />
          ) : error ? (
            <ErrorState title="Unable to load settings" message={error} onAction={loadSettings} />
          ) : (
            <>
              {successMessage ? (
                <View style={styles.successBanner}>
                  <Text style={styles.successText}>{successMessage}</Text>
                </View>
              ) : null}
              {saveError ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{saveError}</Text>
                </View>
              ) : null}

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>System Configuration</Text>
                <Input
                  label="Company Name"
                  value={form.companyName}
                  onChangeText={(value) => updateField('companyName', value)}
                />
                <Text style={styles.inputLabel}>Default Role for New Users</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {[
                    { label: 'Admin', value: String(ROLE_ADMIN) },
                    { label: 'Manager', value: String(ROLE_MANAGER) },
                    { label: 'Sales', value: String(ROLE_SALES) }
                  ].map((role) => (
                    <Pressable
                      key={role.value}
                      style={[
                        styles.roleChip,
                        form.defaultRole === role.value && styles.roleChipActive
                      ]}
                      onPress={() => updateField('defaultRole', role.value)}
                    >
                      <Text
                        style={[
                          styles.roleChipText,
                          form.defaultRole === role.value && styles.roleChipTextActive
                        ]}
                      >
                        {role.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Email Configuration</Text>
                <Input
                  label="From Email Address"
                  value={form.emailFrom}
                  onChangeText={(value) => updateField('emailFrom', value)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={styles.inputLabel}>Email Provider</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {['smtp', 'sendgrid', 'ses'].map((provider) => (
                    <Pressable
                      key={provider}
                      style={[
                        styles.roleChip,
                        form.emailProvider === provider && styles.roleChipActive
                      ]}
                      onPress={() => updateField('emailProvider', provider)}
                    >
                      <Text
                        style={[
                          styles.roleChipText,
                          form.emailProvider === provider && styles.roleChipTextActive
                        ]}
                      >
                        {provider.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.actionsRow}>
                <Button
                  label={saving ? 'Saving...' : 'Save Settings'}
                  onPress={handleSave}
                  loading={saving}
                  disabled={saving}
                />
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default SettingsScreen;

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
  inputLabel: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8
  },
  chipScroll: {
    marginBottom: 4
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8
  },
  roleChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: '#6366f1'
  },
  roleChipText: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600'
  },
  roleChipTextActive: {
    color: '#c7d2fe'
  },
  actionsRow: {
    marginBottom: 24
  },
  successBanner: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  successText: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600'
  },
  errorBanner: {
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600'
  }
});
