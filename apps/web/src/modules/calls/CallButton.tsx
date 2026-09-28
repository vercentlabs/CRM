'use client';

import type { Call } from '@crm/types';
import { Alert, Button, Dialog, Field, PhoneIcon, Select, useToast } from '@crm/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toDisplayError } from '@/lib/errors';
import { formatDuration } from '@/lib/format';
import { CALL_OUTCOME_OPTIONS } from '@/lib/labels';
import { useQueryKey } from '@/providers/SessionProvider';

type Phase = 'idle' | 'starting' | 'active' | 'ending' | 'ended' | 'failed';

/**
 * Starts a call through the API (the server asks the telephony provider to
 * ring the agent, then the lead). The browser never talks to the provider.
 * States: starting → active (timer) → ended, or failed with a reason.
 */
export function CallButton({ leadId, leadName }: { leadId: number; leadName: string }) {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string | undefined } | null>(
    null,
  );
  const [seconds, setSeconds] = useState(0);
  const [outcome, setOutcome] = useState<string>('Completed');

  useEffect(() => {
    if (phase !== 'active') return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const initiate = useMutation({
    mutationFn: () => api().v1.calls.initiate({ lead_id: leadId }),
    onSuccess: (started) => {
      setCall(started);
      setSeconds(0);
      setPhase('active');
    },
    onError: (err) => {
      setError(toDisplayError(err));
      setPhase('failed');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key('calls') }),
  });

  const end = useMutation({
    mutationFn: () =>
      api().v1.calls.end(call!.id, {
        duration_seconds: seconds,
        call_status: outcome as 'Completed' | 'Missed' | 'Cancelled',
      }),
    onSuccess: () => {
      setPhase('ended');
      toast.success('Call logged', `${leadName} · ${formatDuration(seconds)}`);
      void queryClient.invalidateQueries({ queryKey: key('calls') });
      void queryClient.invalidateQueries({ queryKey: key('reports') });
    },
    onError: (err) => setError(toDisplayError(err)),
  });

  const start = () => {
    setError(null);
    setPhase('starting');
    initiate.mutate();
  };

  const close = () => {
    if (phase === 'active' || phase === 'starting' || end.isPending) return;
    setPhase('idle');
    setCall(null);
    setError(null);
  };

  return (
    <>
      <Button icon={<PhoneIcon />} onClick={start} loading={phase === 'starting'}>
        Call
      </Button>
      <Dialog
        open={phase !== 'idle'}
        onClose={close}
        busy={phase === 'active' || phase === 'starting' || end.isPending}
        title={`Call with ${leadName}`}
        footer={
          phase === 'active' ? (
            <Button variant="danger" loading={end.isPending} onClick={() => end.mutate()}>
              End call
            </Button>
          ) : (
            <Button onClick={close} disabled={phase === 'starting'}>
              Close
            </Button>
          )
        }
      >
        <div aria-live="polite" className="space-y-3 text-sm">
          {phase === 'starting' && <p>Starting the call… your phone will ring first.</p>}
          {phase === 'active' && (
            <>
              <p>
                Call in progress ·{' '}
                <span className="font-mono tabular-nums">{formatDuration(seconds)}</span>
              </p>
              <Field label="Outcome when ending">
                <Select
                  value={outcome}
                  options={CALL_OUTCOME_OPTIONS}
                  onChange={(event) => setOutcome(event.target.value)}
                />
              </Field>
            </>
          )}
          {phase === 'ended' && <p>The call was logged ({formatDuration(seconds)}).</p>}
          {error && (
            <Alert
              tone="danger"
              title={
                phase === 'failed' ? 'The call could not be started' : 'The call could not be ended'
              }
            >
              {error.message}
              {error.requestId && (
                <span className="mt-1 block text-xs">Reference: {error.requestId}</span>
              )}
            </Alert>
          )}
        </div>
      </Dialog>
    </>
  );
}
