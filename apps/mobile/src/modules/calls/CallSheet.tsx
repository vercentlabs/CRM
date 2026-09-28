import type { Call } from '@crm/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, SelectField, Sheet, Text, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { toDisplayError, type DisplayError } from '../../lib/errors';
import { formatDuration } from '../../lib/format';
import { CALL_OUTCOME_OPTIONS } from '../../lib/labels';
import { useQueryKey } from '../../providers/SessionProvider';

type Phase = 'starting' | 'active' | 'ended' | 'failed';

/**
 * Places a call through the API (the server asks the telephony provider to
 * ring the agent first, then the lead). The app never talks to the provider.
 */
export function CallSheet({
  lead,
  onClose,
}: {
  lead: { id: number; full_name: string } | null;
  onClose: () => void;
}) {
  return lead ? <CallFlow key={lead.id} lead={lead} onClose={onClose} /> : null;
}

function CallFlow({
  lead,
  onClose,
}: {
  lead: { id: number; full_name: string };
  onClose: () => void;
}) {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('starting');
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState<DisplayError | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [outcome, setOutcome] = useState<string>('Completed');
  const invalidate = () =>
    Promise.all(
      ['calls', 'reports'].map((s) => queryClient.invalidateQueries({ queryKey: key(s) })),
    );

  const start = useMutation({
    mutationFn: () => api().v1.calls.initiate({ lead_id: lead.id }),
    onSuccess: (started) => {
      setCall(started);
      setPhase('active');
    },
    onError: (err) => {
      setError(toDisplayError(err));
      setPhase('failed');
    },
    onSettled: invalidate,
  });

  const end = useMutation({
    mutationFn: () =>
      api().v1.calls.end(call!.id, {
        duration_seconds: seconds,
        call_status: outcome as 'Completed' | 'Missed' | 'Cancelled',
      }),
    onSuccess: () => {
      setPhase('ended');
      toast.success('Call logged', `${lead.full_name} · ${formatDuration(seconds)}`);
      void invalidate();
    },
    onError: (err) => setError(toDisplayError(err)),
  });

  const { mutate: startCall } = start;
  useEffect(() => {
    startCall();
  }, [startCall]);

  useEffect(() => {
    if (phase !== 'active') return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const busy = phase === 'starting' || phase === 'active' || end.isPending;

  return (
    <Sheet visible onClose={onClose} title={`Call ${lead.full_name}`} busy={busy}>
      <View accessibilityLiveRegion="polite" style={styles.body}>
        {phase === 'starting' ? <Text>Starting the call… your phone will ring first.</Text> : null}
        {phase === 'active' ? (
          <>
            <Text
              variant="title"
              style={{ textAlign: 'center' }}
              accessibilityLabel={`Call duration ${formatDuration(seconds)}`}
            >
              {formatDuration(seconds)}
            </Text>
            <SelectField
              label="Outcome"
              value={outcome}
              options={CALL_OUTCOME_OPTIONS}
              onChange={(v) => setOutcome(v ?? 'Completed')}
            />
            <Button
              label="End call"
              variant="danger"
              icon="phone-off"
              loading={end.isPending}
              onPress={() => end.mutate()}
            />
          </>
        ) : null}
        {phase === 'ended' ? <Text>The call was logged ({formatDuration(seconds)}).</Text> : null}
        {error ? (
          <View accessibilityRole="alert" style={styles.error}>
            <Text color="danger" variant="label">
              {phase === 'failed' ? 'The call could not be started' : 'The call could not be ended'}
            </Text>
            <Text color="muted">{error.message}</Text>
            {error.requestId ? (
              <Text variant="caption" color="muted" selectable>
                Reference: {error.requestId}
              </Text>
            ) : null}
          </View>
        ) : null}
        {phase === 'ended' || phase === 'failed' ? (
          <Button label="Close" onPress={onClose} />
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  error: { gap: 4 },
});
