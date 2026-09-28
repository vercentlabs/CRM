import React, {useCallback, useEffect, useState, useMemo} from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { EmptyState, ErrorState, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import type { CustomersStackParamList } from '../navigation/CustomersStack';

type Customer = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  assigned_to?: number | null;
  created_at?: string | null;
};

const CustomersScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CustomersStackParamList>>();
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isManagerOrHigher } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadCustomers = useCallback(async (isRefresh = false) => {
    setError(null);
    if (!isRefresh) {
      setLoading(true);
    }
    try {
      const data = await apiRequest<{ customers?: Customer[] }>('/customers');
      setCustomers(data.customers || []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load customers.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useFocusEffect(
    useCallback(() => {
      void loadCustomers();
    }, [loadCustomers])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    void loadCustomers(true);
  };

  const handleExport = async () => {
    if (!isManagerOrHigher()) {
      setExportError('You do not have permission to export customers.');
      return;
    }
    setExportError(null);
    setExporting(true);
    try {
      const csv = await apiRequest<string>('/reports/export-customers-csv', {
        headers: { Accept: 'text/csv' }
      });
      await Share.share({ message: csv, title: 'Customers Export' });
    } catch (err) {
      const apiError = err as ApiError;
      setExportError(apiError.message || 'Failed to export customers.');
    } finally {
      setExporting(false);
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
        <AppTopbar placeholder="Search customers..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Customers</Text>
                <Text style={styles.heroSubtitle}>Manage customer profiles and outreach</Text>
                <View style={styles.heroChip}>
                  <Feather name="users" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{customers.length} Customers</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable style={styles.heroButton} onPress={handleRefresh} disabled={refreshing}>
                  <Feather name="refresh-cw" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>
                    {refreshing ? 'Refreshing' : 'Refresh'}
                  </Text>
                </Pressable>
                {isManagerOrHigher() ? (
                  <Pressable
                    style={styles.heroButton}
                    onPress={handleExport}
                    disabled={exporting}
                  >
                    <Feather name="download" size={12} color="#ffffff" />
                    <Text style={styles.heroButtonText}>
                      {exporting ? 'Exporting' : 'Export'}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.heroPrimaryButton}
                  onPress={() => navigation.navigate('CustomerForm', { mode: 'create' })}
                >
                  <Feather name="plus" size={12} color="#4f46e5" />
                  <Text style={styles.heroPrimaryText}>Add Customer</Text>
                </Pressable>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Customer List</Text>
            {exportError ? <Text style={styles.inlineError}>{exportError}</Text> : null}
            {loading ? (
              <LoadingState label="Loading customers..." />
            ) : error ? (
              <ErrorState title="Unable to load customers" message={error} onAction={handleRefresh} />
            ) : customers.length === 0 ? (
              <EmptyState
                title="No customers found"
                message="Add your first customer to get started."
                actionLabel="Add Customer"
                onAction={() => navigation.navigate('CustomerForm', { mode: 'create' })}
              />
            ) : (
              customers.map((customer) => (
                <View key={customer.id} style={styles.customerCard}>
                  <View style={styles.customerHeader}>
                    <View style={styles.customerTitle}>
                      <Text style={styles.customerName}>{customer.name}</Text>
                      <Text style={styles.customerMeta}>
                        {customer.phone || 'No phone'} | {customer.email}
                      </Text>
                    </View>
                    <View style={styles.customerBadge}>
                      <Text style={styles.customerBadgeText}>ID #{customer.id}</Text>
                    </View>
                  </View>
                  <Text style={styles.customerAddress}>
                    {customer.address || 'No address on file'}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default CustomersScreen;

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
  customerCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg
  },
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  customerTitle: {
    flex: 1,
    marginRight: 10
  },
  customerName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700'
  },
  customerMeta: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 2
  },
  customerBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(139, 92, 246, 0.2)'
  },
  customerBadgeText: {
    color: '#c4b5fd',
    fontSize: 10,
    fontWeight: '600'
  },
  customerAddress: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  inlineError: {
    color: '#f87171',
    fontSize: 11,
    marginBottom: 8
  }
});
