import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Card, Chip, Button, Input, LoadingState, ErrorState } from '../components/ui';
import { apiRequest, type ApiError } from '../services/api';
import { useTheme } from '../theme/ThemeProvider';
import type { LeadsStackParamList } from '../navigation/LeadsStack';

type LeadDetail = {
  id: number;
  full_name: string;
  email?: string | null;
  mobile_number?: string | null;
  alternate_number?: string | null;
  source?: string | null;
  notes?: string | null;
  age?: number | null;
  address?: string | null;
  occupation?: string | null;
  monthly_income?: number | null;
  is_aware_of_digital_gold?: boolean;
  status?: string | null;
  next_call_at?: string | null;
  assigned_to?: number | null;
  assigned_user_name?: string | null;
  location_id?: number | null;
  location_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CallDetail = {
  id: number;
  call_status?: string | null;
  startTime?: string | null;
  duration?: number | null;
  outcome?: string | null;
  notes?: string | null;
  lead?: {
    name?: string | null;
    phone?: string | null;
  } | null;
};

const OUTCOME_OPTIONS = ['Connected', 'No Answer', 'Busy', 'Left Voicemail'];

const LeadDetailsScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<LeadsStackParamList>>();
  const route = useRoute<RouteProp<LeadsStackParamList, 'LeadDetails'>>();
  const { leadId, autoCall } = route.params;
  const { theme } = useTheme();
  const { colors } = theme;
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCallId, setActiveCallId] = useState<number | null>(null);
  const [activeCall, setActiveCall] = useState<CallDetail | null>(null);
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [callOutcome, setCallOutcome] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [endingCall, setEndingCall] = useState(false);
  const [autoCallTriggered, setAutoCallTriggered] = useState(false);

  const loadLead = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ lead: LeadDetail }>(`/leads/${leadId}`);
      const nextLead = data.lead;
      setLead(nextLead);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Unable to load lead details.');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useFocusEffect(
    useCallback(() => {
      void loadLead();
    }, [loadLead])
  );

  const loadCall = useCallback(async (callId: number) => {
    setCallError(null);
    setCallLoading(true);
    try {
      const data = await apiRequest<{ call: CallDetail }>(`/calls/${callId}`);
      setActiveCall(data.call);
      if (data.call?.outcome) {
        setCallOutcome(data.call.outcome);
      }
      if (data.call?.notes) {
        setCallNotes(data.call.notes);
      }
    } catch (err) {
      const apiError = err as ApiError;
      setCallError(apiError.message || 'Unable to load call details.');
    } finally {
      setCallLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeCall?.startTime) return;
    const start = new Date(activeCall.startTime).getTime();
    if (Number.isNaN(start)) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - start) / 1000));
      setCallDuration(diff);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall?.startTime]);

  useEffect(() => {
    setAutoCallTriggered(false);
  }, [leadId]);

  useEffect(() => {
    if (!autoCall || !lead || autoCallTriggered || callLoading || activeCallId) return;
    setAutoCallTriggered(true);
    void handleInitiateCall();
  }, [autoCall, lead, autoCallTriggered, callLoading, activeCallId]);

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
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

  const formatCurrency = (value?: number | null) => {
    if (!value) return '-';
    return `INR ${value.toLocaleString('en-IN')}`;
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  const handleInitiateCall = async () => {
    if (!lead) return;
    setCallError(null);
    setCallLoading(true);
    try {
      const data = await apiRequest<{ callId?: number }>('/calls/initiate', {
        method: 'POST',
        body: { leadId: lead.id }
      });
      if (data.callId) {
        setActiveCallId(data.callId);
        await loadCall(data.callId);
      }
    } catch (err) {
      const apiError = err as ApiError;
      setCallError(apiError.message || 'Failed to initiate call.');
    } finally {
      setCallLoading(false);
    }
  };

  const handleEndCall = async () => {
    if (!activeCallId || !activeCall?.startTime) return;
    setEndingCall(true);
    setCallError(null);
    try {
      const start = new Date(activeCall.startTime).getTime();
      const durationSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
      await apiRequest(`/calls/${activeCallId}/end`, {
        method: 'PUT',
        body: {
          end_time: new Date().toISOString(),
          duration_seconds: durationSeconds,
          outcome: callOutcome,
          notes: callNotes
        }
      });
      setActiveCallId(null);
      setActiveCall(null);
      setCallOutcome('');
      setCallNotes('');
      setCallDuration(0);
    } catch (err) {
      const apiError = err as ApiError;
      setCallError(apiError.message || 'Failed to end call.');
    } finally {
      setEndingCall(false);
    }
  };

  const assignmentLabel = useMemo(() => {
    if (!lead) return '-';
    if (lead.assigned_user_name) return lead.assigned_user_name;
    if (lead.assigned_to) return `User #${lead.assigned_to}`;
    return 'Unassigned';
  }, [lead]);

  const statusLabel = useMemo(() => lead?.status || 'New', [lead]);

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
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Lead Details</Text>
          <Pressable
            style={styles.editButton}
            onPress={() => navigation.navigate('LeadForm', { mode: 'edit', leadId })}
          >
            <Feather name="edit-3" size={16} color={colors.brand} />
            <Text style={[styles.editButtonText, { color: colors.brand }]}>Edit</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {loading ? (
            <LoadingState label="Loading lead..." />
          ) : error ? (
            <ErrorState title="Unable to load lead" message={error} onAction={loadLead} />
          ) : lead ? (
            <>
              <Card style={styles.card}>
                <Text style={[styles.leadName, { color: colors.foreground }]}>{lead.full_name}</Text>
                <View style={styles.statusRow}>
                  <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                    Status: {lead.status || 'New'}
                  </Text>
                  <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                    Assigned: {assignmentLabel}
                  </Text>
                </View>
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                  Created {formatDate(lead.created_at)} | Updated {formatDate(lead.updated_at)}
                </Text>
              </Card>

              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Contact</Text>
                <Text style={[styles.detailText, { color: colors.mutedForeground }]}>
                  Phone: {lead.mobile_number || '-'}
                </Text>
                <Text style={[styles.detailText, { color: colors.mutedForeground }]}>
                  Alternate: {lead.alternate_number || '-'}
                </Text>
                <Text style={[styles.detailText, { color: colors.mutedForeground }]}>
                  Email: {lead.email || '-'}
                </Text>
                <View style={styles.callActions}>
                  <Button
                    label={callLoading ? 'Calling...' : 'Start Call'}
                    onPress={handleInitiateCall}
                    disabled={callLoading}
                  />
                </View>
              </Card>

              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Profile</Text>
                <Text style={[styles.detailText, { color: colors.mutedForeground }]}>
                  Age: {lead.age || '-'}
                </Text>
                <Text style={[styles.detailText, { color: colors.mutedForeground }]}>
                  Occupation: {lead.occupation || '-'}
                </Text>
                <Text style={[styles.detailText, { color: colors.mutedForeground }]}>
                  Monthly Income: {formatCurrency(lead.monthly_income)}
                </Text>
                <Text style={[styles.detailText, { color: colors.mutedForeground }]}>
                  Address: {lead.address || '-'}
                </Text>
                <Text style={[styles.detailText, { color: colors.mutedForeground }]}>
                  Digital Gold Aware: {lead.is_aware_of_digital_gold ? 'Yes' : 'No'}
                </Text>
              </Card>

              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Quick View</Text>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Status</Text>
                <View style={styles.readonlyField}>
                  <Text style={styles.readonlyText}>{statusLabel}</Text>
                </View>

                <Text style={[styles.label, { color: colors.mutedForeground }]}>Next Call</Text>
                <View style={styles.readonlyField}>
                  <Text style={styles.readonlyText}>
                    {lead.next_call_at ? formatDate(lead.next_call_at) : 'Not scheduled'}
                  </Text>
                </View>

                <Text style={[styles.label, { color: colors.mutedForeground }]}>Assigned To</Text>
                <View style={styles.readonlyField}>
                  <Text style={styles.readonlyText}>{assignmentLabel}</Text>
                </View>
              </Card>
            </>
          ) : null}
        </ScrollView>

        {activeCallId ? (
          <View style={styles.callPanel}>
            {callLoading ? (
              <LoadingState label="Loading call..." />
            ) : callError ? (
              <ErrorState
                title="Call issue"
                message={callError}
                onAction={() => loadCall(activeCallId)}
              />
            ) : (
              <>
                <View style={styles.callHeader}>
                  <Text style={styles.callTitle}>Active Call</Text>
                  <Text style={styles.callTimer}>{formatDuration(callDuration)}</Text>
                </View>
                <Text style={styles.callMeta}>
                  {activeCall?.lead?.name || lead?.full_name || 'Lead'}
                </Text>
                <View style={styles.callChips}>
                  {OUTCOME_OPTIONS.map((option) => (
                    <Chip
                      key={option}
                      label={option}
                      active={callOutcome === option}
                      onPress={() => setCallOutcome(option)}
                    />
                  ))}
                </View>
                <Input
                  label="Call Notes"
                  value={callNotes}
                  onChangeText={setCallNotes}
                  multiline
                  style={styles.callNotes}
                />
                <Button
                  label={endingCall ? 'Ending...' : 'End Call'}
                  onPress={handleEndCall}
                  loading={endingCall}
                  disabled={endingCall}
                />
              </>
            )}
          </View>
        ) : null}

      </SafeAreaView>
    </LinearGradient>
  );
};

export default LeadDetailsScreen;

const styles = StyleSheet.create({
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
    borderColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600'
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600'
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16
  },
  card: {
    gap: 8
  },
  leadName: {
    fontSize: 18,
    fontWeight: '700'
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  statusText: {
    fontSize: 12
  },
  metaText: {
    fontSize: 11
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600'
  },
  detailText: {
    fontSize: 12
  },
  callActions: {
    marginTop: 8
  },
  label: {
    fontSize: 11,
    fontWeight: '600'
  },
  readonlyField: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2645',
    backgroundColor: '#0f1526',
    marginBottom: 12
  },
  readonlyText: {
    color: '#e5e7f0',
    fontSize: 12
  },
  callPanel: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f2645',
    backgroundColor: '#0f1526'
  },
  callHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  callTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  callTimer: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600'
  },
  callMeta: {
    color: '#9aa1b5',
    fontSize: 11,
    marginBottom: 8
  },
  callChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8
  },
  callNotes: {
    height: 72,
    textAlignVertical: 'top',
    marginBottom: 8
  }
});
