import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import AppTopbar from '../components/AppTopbar';
import { Card, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../context/AuthContext';
import { apiRequest, type ApiError } from '../services/api';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '../config/constants';

type ProfileRecord = {
  id: number;
  full_name?: string | null;
  email: string;
  username?: string | null;
  roleId?: number;
  role_id?: number;
  mobile_number?: string | null;
  is_active?: boolean;
};

const roleLabels: Record<number, string> = {
  [ROLE_ADMIN]: 'Administrator',
  [ROLE_MANAGER]: 'Manager',
  [ROLE_SALES]: 'Sales'
};

const ProfileScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiRequest<{ user?: ProfileRecord }>('/users/me');
      if (data?.user) {
        setProfile(data.user);
      }
      await refreshUser();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Unable to load profile details.');
    } finally {
      setLoading(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const displayProfile = useMemo(() => {
    return {
      full_name: profile?.full_name || user?.name || profile?.username || 'User',
      email: profile?.email || user?.email || 'Not available',
      roleId: profile?.roleId ?? profile?.role_id ?? user?.roleId ?? ROLE_SALES,
      username: profile?.username || 'Not set',
      mobile_number: profile?.mobile_number || 'Not set',
      is_active: profile?.is_active
    };
  }, [profile, user]);

  const roleLabel = roleLabels[displayProfile.roleId] || 'User';
  const statusLabel =
    displayProfile.is_active === undefined ? 'Unknown' : displayProfile.is_active ? 'Active' : 'Inactive';

  const infoItems: Array<{ label: string; value: string; icon: keyof typeof Feather.glyphMap }> = [
    { label: 'Full Name', value: displayProfile.full_name, icon: 'user' },
    { label: 'Role', value: roleLabel, icon: 'briefcase' },
    { label: 'Email', value: displayProfile.email, icon: 'mail' },
    { label: 'Username', value: displayProfile.username, icon: 'at-sign' },
    { label: 'Mobile', value: displayProfile.mobile_number, icon: 'phone' },
    { label: 'Status', value: statusLabel, icon: 'check-circle' }
  ];

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar />

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {loading && !profile && !user ? <LoadingState label="Loading profile..." /> : null}

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Profile Details</Text>
            <View style={styles.infoList}>
              {infoItems.map((item) => (
                <View key={item.label} style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Feather name={item.icon} size={14} color={colors.mutedForeground} />
                  </View>
                  <View style={styles.infoText}>
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                    <Text style={[styles.infoValue, { color: colors.foreground }]}>{item.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>

          {/* Security section removed per request */}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24
  },
  sectionCard: {
    marginBottom: 16,
    gap: 12
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600'
  },
  infoList: {
    gap: 12
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  infoText: {
    flex: 1
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600'
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2
  },
  errorBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)'
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600'
  }
});
