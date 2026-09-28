import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
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

const roleLabel = (role?: number) => {
  switch (role) {
    case ROLE_ADMIN:
      return 'Admin';
    case ROLE_MANAGER:
      return 'Manager';
    case ROLE_SALES:
      return 'Sales';
    default:
      return 'User';
  }
};

const UsersScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<UsersStackParamList>>();
  const { theme, resolvedMode } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isLight = resolvedMode === 'light';
  const { isAdmin, isManagerOrHigher } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const loadUsers = useCallback(async (isRefresh = false) => {
    setError(null);
    if (!isRefresh) {
      setLoading(true);
    }
    try {
      const data = await apiRequest<{ users?: UserRecord[] }>('/users');
      setUsers(data.users || []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load users.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useFocusEffect(
    useCallback(() => {
      void loadUsers(true);
    }, [loadUsers])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    void loadUsers(true);
  };

  const handleToggleStatus = async (userId: number) => {
    setTogglingId(userId);
    try {
      await apiRequest(`/users/${userId}/status`, { method: 'PATCH' });
      await loadUsers(true);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to update user status.');
    } finally {
      setTogglingId(null);
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
        <AppTopbar placeholder="Search users..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Team Management</Text>
                <Text style={styles.heroSubtitle}>Manage users, roles, and status</Text>
                <View style={styles.heroChip}>
                  <Feather name="users" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{users.length} Total Users</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable style={styles.heroButton} onPress={handleRefresh} disabled={refreshing}>
                  <Feather name="refresh-cw" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>
                    {refreshing ? 'Refreshing' : 'Refresh'}
                  </Text>
                </Pressable>
                {isAdmin() ? (
                  <Pressable
                    style={[
                      styles.heroPrimaryButton,
                      isLight ? { backgroundColor: colors.primary } : null
                    ]}
                    onPress={() => navigation.navigate('UserForm', { mode: 'create' })}
                  >
                    <Feather
                      name="plus"
                      size={12}
                      color={isLight ? colors.primaryForeground : '#4f46e5'}
                    />
                    <Text
                      style={[
                        styles.heroPrimaryText,
                        { color: isLight ? colors.primaryForeground : '#4f46e5' }
                      ]}
                    >
                      Add User
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </LinearGradient>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Users</Text>
            {loading ? (
              <LoadingState label="Loading users..." />
            ) : error ? (
              <ErrorState title="Unable to load users" message={error} onAction={handleRefresh} />
            ) : users.length === 0 ? (
              <EmptyState
                title="No users found"
                message="Invite new team members to get started."
                actionLabel={isAdmin() ? 'Add User' : undefined}
                onAction={
                  isAdmin() ? () => navigation.navigate('UserForm', { mode: 'create' }) : undefined
                }
              />
            ) : (
              users.map((user) => {
                const role = user.roleId ?? user.role_id;
                const active = user.is_active ?? true;
                return (
                  <View key={user.id} style={styles.userCard}>
                    <View style={styles.userHeader}>
                      <View style={styles.userTitle}>
                        <Text style={styles.userName}>{user.full_name || user.username}</Text>
                        <Text style={styles.userMeta}>{user.email}</Text>
                      </View>
                      <View style={styles.roleBadge}>
                        <Text style={styles.roleBadgeText}>{roleLabel(role)}</Text>
                      </View>
                    </View>
                    <View style={styles.userRow}>
                      <View>
                        <Text style={styles.userLabel}>Mobile</Text>
                        <Text style={styles.userValue}>{user.mobile_number || '-'}</Text>
                      </View>
                      <View>
                        <Text style={styles.userLabel}>Status</Text>
                        <Text style={styles.userValue}>{active ? 'Active' : 'Inactive'}</Text>
                      </View>
                    </View>
                    {isAdmin() ? (
                      <View style={styles.actionRow}>
                        <Button
                          label="Edit"
                          variant="secondary"
                          size="sm"
                          onPress={() =>
                            navigation.navigate('UserForm', { mode: 'edit', userId: user.id })
                          }
                          style={styles.actionButton}
                        />
                        <Button
                          label={togglingId === user.id ? 'Updating...' : active ? 'Deactivate' : 'Activate'}
                          variant={active ? 'danger' : 'primary'}
                          size="sm"
                          onPress={() => handleToggleStatus(user.id)}
                          loading={togglingId === user.id}
                          disabled={togglingId === user.id}
                          style={styles.actionButton}
                        />
                      </View>
                    ) : isManagerOrHigher() ? (
                      <View style={styles.actionRow}>
                        <Button
                          label="View"
                          variant="secondary"
                          size="sm"
                          onPress={() => {}}
                          style={styles.actionButton}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default UsersScreen;

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
  userCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10
  },
  userTitle: {
    flex: 1
  },
  userName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700'
  },
  userMeta: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 2
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(139, 92, 246, 0.2)'
  },
  roleBadgeText: {
    color: '#c4b5fd',
    fontSize: 10,
    fontWeight: '600'
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  userLabel: {
    color: colors.mutedForeground,
    fontSize: 10
  },
  userValue: {
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
  }
});
