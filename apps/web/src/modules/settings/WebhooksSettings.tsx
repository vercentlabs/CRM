'use client';

import type { WebhookEndpoint, WebhookEndpointWithSecret } from '@crm/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  Skeleton,
  useToast,
} from '@crm/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiErrorState } from '@/components/feedback/QueryState';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useQueryKey } from '@/providers/SessionProvider';

/**
 * Outbound webhooks (settings.integrations.manage). The signing secret is
 * shown exactly once after create/rotate and is never stored in the browser.
 */
export function WebhooksSettings() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const toast = useToast();
  const endpoints = useQuery({
    queryKey: key('webhooks'),
    queryFn: () => api().v1.webhooks.list(),
  });
  const eventTypes = useQuery({
    queryKey: key('webhooks', 'event-types'),
    queryFn: () => api().v1.webhooks.eventTypes(),
    staleTime: Infinity,
  });
  const [revealed, setRevealed] = useState<WebhookEndpointWithSecret | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: 'rotate' | 'delete';
    endpoint: WebhookEndpoint;
  } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key('webhooks') });

  const toggle = useMutation({
    mutationFn: (endpoint: WebhookEndpoint) =>
      api().v1.webhooks.update(endpoint.id, { active: !endpoint.active }),
    onSuccess: (endpoint) => {
      toast.success(endpoint.active ? 'Webhook enabled' : 'Webhook disabled');
      void refresh();
    },
    onError: (error) => toast.error('Could not update webhook', errorMessage(error)),
  });
  const rotate = useMutation({
    mutationFn: (id: string) => api().v1.webhooks.rotateSecret(id),
    onSuccess: (result) => {
      setConfirm(null);
      setRevealed(result);
      void refresh();
    },
    onError: (error) => toast.error('Could not rotate secret', errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api().v1.webhooks.remove(id),
    onSuccess: () => {
      setConfirm(null);
      toast.success('Webhook deleted');
      void refresh();
    },
    onError: (error) => toast.error('Could not delete webhook', errorMessage(error)),
  });

  if (endpoints.isPending) return <Skeleton className="h-64" />;
  if (endpoints.error)
    return <ApiErrorState error={endpoints.error} onRetry={() => void endpoints.refetch()} />;

  return (
    <div className="max-w-3xl space-y-4">
      <CreateWebhook
        eventTypes={eventTypes.data ?? []}
        onCreated={(result) => {
          setRevealed(result);
          void refresh();
        }}
      />
      {endpoints.data.length === 0 ? (
        <EmptyState
          title="No webhooks yet"
          description="Add an HTTPS endpoint to receive CRM events."
        />
      ) : (
        <ul className="space-y-3" aria-label="Webhook endpoints">
          {endpoints.data.map((endpoint) => (
            <li key={endpoint.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-all font-medium text-fg">{endpoint.url}</p>
                    {endpoint.description && (
                      <p className="text-sm text-muted">{endpoint.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={endpoint.active ? 'success' : 'neutral'}>
                        {endpoint.active ? 'Active' : 'Disabled'}
                      </Badge>
                      {endpoint.events.map((event) => (
                        <Badge key={event} tone="info">
                          {event}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted">
                      {endpoint.lastDelivery
                        ? `Last delivery: ${endpoint.lastDelivery.status} · ${formatDateTime(endpoint.lastDelivery.at)}`
                        : 'No deliveries yet'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={toggle.isPending && toggle.variables?.id === endpoint.id}
                      onClick={() => toggle.mutate(endpoint)}
                    >
                      {endpoint.active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirm({ kind: 'rotate', endpoint })}
                    >
                      Rotate secret
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirm({ kind: 'delete', endpoint })}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'rotate') rotate.mutate(confirm.endpoint.id);
          else remove.mutate(confirm.endpoint.id);
        }}
        title={confirm?.kind === 'rotate' ? 'Rotate signing secret?' : 'Delete webhook?'}
        description={
          confirm?.kind === 'rotate'
            ? 'The current secret stops working immediately. Update the receiver with the new secret.'
            : 'Deliveries to this endpoint stop and its delivery log is removed.'
        }
        confirmLabel={confirm?.kind === 'rotate' ? 'Rotate' : 'Delete'}
        loading={rotate.isPending || remove.isPending}
      />
      <SecretDialog result={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}

function CreateWebhook({
  eventTypes,
  onCreated,
}: {
  eventTypes: string[];
  onCreated: (result: WebhookEndpointWithSecret) => void;
}) {
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api().v1.webhooks.create({
        url: url.trim(),
        events,
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    onSuccess: (result) => {
      setUrl('');
      setDescription('');
      setEvents([]);
      onCreated(result);
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!url.trim()) return setError('Enter the HTTPS URL of the receiver');
    if (events.length === 0) return setError('Select at least one event');
    create.mutate();
  };
  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate aria-label="Add webhook">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Endpoint URL" hint="HTTPS only; must resolve to a public address.">
          <Input
            type="url"
            inputMode="url"
            placeholder="https://hooks.example.com/crm"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field label="Description (optional)">
          <Input
            value={description}
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-fg">Events</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {eventTypes.map((type) => (
              <Checkbox
                key={type}
                label={type}
                checked={events.includes(type)}
                onChange={(e) =>
                  setEvents((current) =>
                    e.target.checked ? [...current, type] : current.filter((t) => t !== type),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={create.isPending}>
            Add webhook
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SecretDialog({
  result,
  onClose,
}: {
  result: WebhookEndpointWithSecret | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.secret);
      toast.success('Secret copied');
    } catch {
      toast.error('Copy failed', 'Select the secret and copy it manually');
    }
  };
  return (
    <Dialog
      open={result !== null}
      onClose={onClose}
      title="Signing secret"
      description="Copy it now: it will not be shown again."
      footer={
        <>
          <Button variant="secondary" onClick={() => void copy()}>
            Copy
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          Verify the <code>x-crm-signature</code> header: HMAC-SHA256 of{' '}
          <code>{'<x-crm-timestamp>.<body>'}</code> with this secret.
        </p>
        <code
          data-testid="webhook-secret"
          className="block break-all rounded border border-border bg-surface-muted p-3 font-mono text-xs"
        >
          {result?.secret}
        </code>
      </div>
    </Dialog>
  );
}
