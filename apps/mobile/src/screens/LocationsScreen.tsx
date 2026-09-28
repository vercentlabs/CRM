import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { Button, Card, Chip, EmptyState, ErrorState, Input, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

type Location = {
  id: number;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pin_code?: string | null;
  contact_phone?: string | null;
  manager_id?: number | null;
  full_name?: string | null;
};

type ExecutiveLocation = {
  id: number;
  full_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  updated_at?: string | null;
  lastLocationUpdate?: string | null;
  last_location_update?: string | null;
};

type FormState = {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  contact_phone: string;
  manager_id: string;
};

const emptyForm: FormState = {
  name: '',
  address: '',
  city: '',
  state: '',
  country: 'India',
  pin_code: '',
  contact_phone: '',
  manager_id: ''
};

const LocationsScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isManagerOrHigher, isSales } = useAuth();
  const canManage = isManagerOrHigher();
  const canSales = isSales();
  const [locations, setLocations] = useState<Location[]>([]);
  const [executives, setExecutives] = useState<ExecutiveLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(2);
  const [refreshingExecs, setRefreshingExecs] = useState(false);
  const [execViewMode, setExecViewMode] = useState<'list' | 'map'>('list');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [locationUpdate, setLocationUpdate] = useState({ latitude: '', longitude: '', address: '' });
  const [updatingLocation, setUpdatingLocation] = useState(false);

  const loadExecutives = useCallback(
    async (showSpinner = false) => {
      if (!canManage) return;
      if (showSpinner) {
        setRefreshingExecs(true);
      }
      try {
        const execData = await apiRequest<{ executives?: ExecutiveLocation[] }>(
          '/sales-locations/executives'
        );
        setExecutives(execData.executives || []);
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError.message || 'Failed to load executive locations.');
      } finally {
        if (showSpinner) {
          setRefreshingExecs(false);
        }
      }
    },
    [canManage]
  );

  const loadLocations = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (canManage) {
        const data = await apiRequest<{ locations?: Location[] }>('/sales-locations');
        setLocations(data.locations || []);
        await loadExecutives();
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load locations.');
    } finally {
      setLoading(false);
    }
  }, [canManage, loadExecutives]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    if (!autoRefresh || !canManage) return;
    const intervalMs = refreshInterval * 60 * 1000;
    const interval = setInterval(() => {
      void loadExecutives();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, loadExecutives, canManage]);

  const updateForm = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (location: Location) => {
    setEditingId(location.id);
    setForm({
      name: location.name || '',
      address: location.address || '',
      city: location.city || '',
      state: location.state || '',
      country: location.country || 'India',
      pin_code: location.pin_code || '',
      contact_phone: location.contact_phone || '',
      manager_id: location.manager_id ? String(location.manager_id) : ''
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Location name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || 'India',
      pin_code: form.pin_code.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      manager_id: form.manager_id ? Number(form.manager_id) : null
    };

    try {
      if (editingId) {
        await apiRequest(`/sales-locations/${editingId}`, { method: 'PUT', body: payload });
      } else {
        await apiRequest('/sales-locations', { method: 'POST', body: payload });
      }
      setShowForm(false);
      await loadLocations();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to save location.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (locationId: number) => {
    setError(null);
    try {
      await apiRequest(`/sales-locations/${locationId}`, { method: 'DELETE' });
      setLocations((prev) => prev.filter((item) => item.id !== locationId));
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to delete location.');
    }
  };

  const handleUpdateLocation = async () => {
    if (!locationUpdate.latitude || !locationUpdate.longitude) {
      setError('Latitude and longitude are required.');
      return;
    }
    setUpdatingLocation(true);
    setError(null);
    try {
      await apiRequest('/sales-locations/update-location', {
        method: 'POST',
        body: {
          latitude: Number(locationUpdate.latitude),
          longitude: Number(locationUpdate.longitude),
          address: locationUpdate.address.trim() || null
        }
      });
      setLocationUpdate({ latitude: '', longitude: '', address: '' });
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to update location.');
    } finally {
      setUpdatingLocation(false);
    }
  };

  const formattedExecutives = useMemo(() => executives.filter((exec) => exec.full_name), [executives]);

  const getExecUpdatedAt = (exec: ExecutiveLocation) =>
    exec.updated_at || exec.lastLocationUpdate || exec.last_location_update || null;

  const formatLastUpdate = (dateString?: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (Number.isNaN(diff)) return dateString;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  };

  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isLocationStale = (dateString?: string | null) => {
    if (!dateString) return true;
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (Number.isNaN(diff)) return true;
    return diff > 900;
  };

  const getLocationFreshness = (dateString?: string | null) => {
    if (!dateString) {
      return { label: 'No Data', bg: 'rgba(148, 163, 184, 0.2)', text: '#cbd5f5' };
    }
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (Number.isNaN(diff)) {
      return { label: 'Unknown', bg: 'rgba(148, 163, 184, 0.2)', text: '#cbd5f5' };
    }
    if (diff < 300) {
      return { label: 'Live', bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' };
    }
    if (diff < 900) {
      return { label: 'Recent', bg: 'rgba(251, 191, 36, 0.2)', text: '#fbbf24' };
    }
    return { label: 'Stale', bg: 'rgba(248, 113, 113, 0.2)', text: '#f87171' };
  };

  const hasStaleData = useMemo(
    () => formattedExecutives.some((exec) => isLocationStale(getExecUpdatedAt(exec))),
    [formattedExecutives]
  );

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search locations..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Sales Locations</Text>
                <Text style={styles.heroSubtitle}>Manage locations and field activity</Text>
                <View style={styles.heroChip}>
                  <Feather name="map-pin" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{locations.length} Locations</Text>
                </View>
              </View>
              {canManage ? (
                <View style={styles.heroActions}>
                  <Pressable style={styles.heroButton} onPress={loadLocations}>
                    <Feather name="refresh-cw" size={12} color="#ffffff" />
                    <Text style={styles.heroButtonText}>Refresh</Text>
                  </Pressable>
                  <Pressable style={styles.heroButton} onPress={openCreate}>
                    <Feather name="plus" size={12} color="#ffffff" />
                    <Text style={styles.heroButtonText}>Add</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </LinearGradient>

          {error ? (
            <ErrorState title="Action failed" message={error} onAction={loadLocations} />
          ) : null}

          {canSales ? (
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Update My Location</Text>
              <Input
                label="Latitude"
                value={locationUpdate.latitude}
                onChangeText={(value) => setLocationUpdate((prev) => ({ ...prev, latitude: value }))}
                keyboardType="numbers-and-punctuation"
              />
              <Input
                label="Longitude"
                value={locationUpdate.longitude}
                onChangeText={(value) => setLocationUpdate((prev) => ({ ...prev, longitude: value }))}
                keyboardType="numbers-and-punctuation"
              />
              <Input
                label="Address"
                value={locationUpdate.address}
                onChangeText={(value) => setLocationUpdate((prev) => ({ ...prev, address: value }))}
              />
              <Button
                label={updatingLocation ? 'Updating...' : 'Update Location'}
                onPress={handleUpdateLocation}
                disabled={updatingLocation}
                loading={updatingLocation}
              />
            </Card>
          ) : null}

          {showForm ? (
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{editingId ? 'Edit Location' : 'New Location'}</Text>
              <Input label="Name *" value={form.name} onChangeText={(value) => updateForm('name', value)} />
              <Input label="Address" value={form.address} onChangeText={(value) => updateForm('address', value)} />
              <Input label="City" value={form.city} onChangeText={(value) => updateForm('city', value)} />
              <Input label="State" value={form.state} onChangeText={(value) => updateForm('state', value)} />
              <Input label="Country" value={form.country} onChangeText={(value) => updateForm('country', value)} />
              <Input label="PIN Code" value={form.pin_code} onChangeText={(value) => updateForm('pin_code', value)} />
              <Input label="Contact Phone" value={form.contact_phone} onChangeText={(value) => updateForm('contact_phone', value)} />
              <Input
                label="Manager ID"
                value={form.manager_id}
                onChangeText={(value) => updateForm('manager_id', value)}
                keyboardType="number-pad"
              />
              <View style={styles.formActions}>
                <Button label="Cancel" variant="secondary" onPress={() => setShowForm(false)} />
                <Button
                  label={saving ? 'Saving...' : 'Save'}
                  onPress={handleSave}
                  disabled={saving}
                  loading={saving}
                />
              </View>
            </Card>
          ) : null}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Locations</Text>
            {loading ? (
              <LoadingState label="Loading locations..." />
            ) : locations.length === 0 ? (
              <EmptyState title="No locations" message="Add a location to get started." />
            ) : (
              locations.map((location) => (
                <View key={location.id} style={styles.locationCard}>
                  <View style={styles.locationHeader}>
                    <View style={styles.locationText}>
                      <Text style={styles.locationName}>{location.name}</Text>
                      <Text style={styles.locationMeta}>{location.city || location.state || '-'}</Text>
                    </View>
                    {canManage ? (
                      <View style={styles.locationActions}>
                        <Pressable style={styles.iconButton} onPress={() => openEdit(location)}>
                          <Feather name="edit" size={14} color="#cbd5f5" />
                        </Pressable>
                        <Pressable style={styles.iconButton} onPress={() => handleDelete(location.id)}>
                          <Feather name="trash" size={14} color="#f87171" />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.locationDetail}>{location.address || 'No address'}</Text>
                  <Text style={styles.locationDetail}>Manager: {location.full_name || 'Unassigned'}</Text>
                </View>
              ))
            )}
          </View>

          {canManage ? (
            <View style={styles.sectionCard}>
              <View style={styles.execHeaderRow}>
                <Text style={styles.sectionTitle}>Executives Live Location</Text>
                <Pressable
                  style={styles.execRefreshButton}
                  onPress={() => {
                    void loadExecutives(true);
                  }}
                  disabled={refreshingExecs}
                >
                  <Feather name="refresh-cw" size={12} color="#c7d2fe" />
                  <Text style={styles.execRefreshText}>
                    {refreshingExecs ? 'Refreshing' : 'Refresh'}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.execMetaRow}>
                <Text style={styles.execMetaText}>
                  {formattedExecutives.length} executives with location data
                </Text>
                {hasStaleData ? (
                  <View style={styles.staleBadge}>
                    <Text style={styles.staleBadgeText}>Some data may be stale</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.execToggleRow}>
                {(['list', 'map'] as const).map((mode) => {
                  const isActive = execViewMode === mode;
                  const isDisabled = mode === 'map';
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => !isDisabled && setExecViewMode(mode)}
                      style={[
                        styles.execToggleButton,
                        isActive && styles.execToggleButtonActive,
                        isDisabled && styles.execToggleButtonDisabled
                      ]}
                      disabled={isDisabled}
                    >
                      <Text
                        style={[
                          styles.execToggleText,
                          isActive && styles.execToggleTextActive,
                          isDisabled && styles.execToggleTextDisabled
                        ]}
                      >
                        {mode === 'list' ? 'List View' : 'Map View'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.autoRefreshRow}>
                <Pressable
                  style={[
                    styles.autoRefreshButton,
                    autoRefresh && styles.autoRefreshButtonActive
                  ]}
                  onPress={() => setAutoRefresh((prev) => !prev)}
                >
                  <Feather
                    name={autoRefresh ? 'check-circle' : 'circle'}
                    size={12}
                    color={autoRefresh ? '#22c55e' : '#9aa1b5'}
                  />
                  <Text
                    style={[
                      styles.autoRefreshText,
                      autoRefresh && styles.autoRefreshTextActive
                    ]}
                  >
                    Auto-refresh {autoRefresh ? 'On' : 'Off'}
                  </Text>
                </Pressable>
                {autoRefresh ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.intervalRow}>
                    {[1, 2, 5, 10].map((minutes) => (
                      <Chip
                        key={minutes}
                        label={`${minutes} min`}
                        active={refreshInterval === minutes}
                        onPress={() => setRefreshInterval(minutes)}
                      />
                    ))}
                  </ScrollView>
                ) : null}
              </View>

              {execViewMode === 'map' ? (
                <View style={styles.mapPlaceholder}>
                  <Feather name="map" size={20} color="#9aa1b5" />
                  <Text style={styles.mapPlaceholderTitle}>Map View Coming Soon</Text>
                  <Text style={styles.mapPlaceholderText}>
                    We're working on a map view for better visualization.
                  </Text>
                </View>
              ) : formattedExecutives.length === 0 ? (
                <EmptyState title="No executives" message="No active sales executives found." />
              ) : (
                formattedExecutives.map((exec) => {
                  const updatedAt = getExecUpdatedAt(exec);
                  const freshness = getLocationFreshness(updatedAt);
                  const hasLocation =
                    exec.latitude !== null &&
                    exec.latitude !== undefined &&
                    exec.longitude !== null &&
                    exec.longitude !== undefined;

                  return (
                    <View key={exec.id} style={styles.locationCard}>
                      <View style={styles.execRowHeader}>
                        <View style={styles.execRowText}>
                          <Text style={styles.locationName}>{exec.full_name}</Text>
                          <Text style={styles.locationDetail}>{exec.address || 'No address'}</Text>
                        </View>
                        <View style={[styles.execStatusBadge, { backgroundColor: freshness.bg }]}>
                          <Text style={[styles.execStatusText, { color: freshness.text }]}>
                            {freshness.label}
                          </Text>
                        </View>
                      </View>
                      {hasLocation ? (
                        <Text style={styles.locationDetail}>
                          {Number(exec.latitude).toFixed(6)}, {Number(exec.longitude).toFixed(6)}
                        </Text>
                      ) : (
                        <Text style={styles.locationDetail}>No location data</Text>
                      )}
                      <Text style={styles.locationDetail}>
                        Last updated: {formatLastUpdate(updatedAt)}
                      </Text>
                      <Text style={styles.locationDetail}>{formatDateTime(updatedAt)}</Text>
                    </View>
                  );
                })
              )}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default LocationsScreen;

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
    gap: 8
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
    marginBottom: 16,
    gap: 12
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600'
  },
  execHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  execRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg
  },
  execRefreshText: {
    color: '#c7d2fe',
    fontSize: 10,
    fontWeight: '600'
  },
  execMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8
  },
  execMetaText: {
    color: colors.mutedForeground,
    fontSize: 11
  },
  staleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(248, 113, 113, 0.2)'
  },
  staleBadgeText: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '600'
  },
  execToggleRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 12
  },
  execToggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: colors.inputBg
  },
  execToggleButtonActive: {
    backgroundColor: '#5b3bff'
  },
  execToggleButtonDisabled: {
    opacity: 0.45
  },
  execToggleText: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600'
  },
  execToggleTextActive: {
    color: colors.primaryForeground
  },
  execToggleTextDisabled: {
    color: colors.mutedForeground
  },
  autoRefreshRow: {
    marginBottom: 12
  },
  autoRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg
  },
  autoRefreshButtonActive: {
    borderColor: 'rgba(34, 197, 94, 0.6)'
  },
  autoRefreshText: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600'
  },
  autoRefreshTextActive: {
    color: '#e2e8f0'
  },
  intervalRow: {
    marginTop: 10
  },
  formActions: {
    flexDirection: 'row',
    gap: 12
  },
  locationCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    backgroundColor: colors.inputBg
  },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  locationText: {
    flex: 1
  },
  locationName: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '700'
  },
  locationMeta: {
    color: colors.mutedForeground,
    fontSize: 10,
    marginTop: 2
  },
  locationDetail: {
    color: '#cbd5f5',
    fontSize: 11,
    marginBottom: 4
  },
  execRowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6
  },
  execRowText: {
    flex: 1
  },
  execStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  execStatusText: {
    fontSize: 10,
    fontWeight: '600'
  },
  mapPlaceholder: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: 'center',
    backgroundColor: colors.inputBg
  },
  mapPlaceholderTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8
  },
  mapPlaceholderText: {
    color: colors.mutedForeground,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6
  },
  locationActions: {
    flexDirection: 'row',
    gap: 8
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
