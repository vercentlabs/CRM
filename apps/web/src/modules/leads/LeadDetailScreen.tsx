'use client';

import type { Lead } from '@crm/types';
import {
  Badge,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  PageSkeleton,
  Select,
  Skeleton,
  useToast,
} from '@crm/ui';
import Link from 'next/link';
import { useState } from 'react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { QueryBoundary } from '@/components/feedback/QueryState';
import { errorMessage } from '@/lib/errors';
import { formatAmount, formatDate, formatDateTime, formatRelative, isPast } from '@/lib/format';
import {
  CHANNEL_LABEL,
  LEAD_STATUS_OPTIONS,
  MESSAGE_STATUS_TONE,
  STAGE_TONE,
  leadSourceLabel,
} from '@/lib/labels';
import { CallButton } from '@/modules/calls/CallButton';
import { useLeadMessages } from '@/modules/messages/hooks';
import { SendMessageForm } from '@/modules/messages/SendMessageForm';
import { OpportunityFormSheet } from '@/modules/opportunities/OpportunityFormSheet';
import { useOpportunities } from '@/modules/opportunities/hooks';
import { useSession } from '@/providers/SessionProvider';
import { useLead, useLeadMutations } from './hooks';
import { AssignLeadDialog, LeadStatusBadge, ScheduleFollowupDialog } from './LeadDialogs';
import { LeadFormSheet } from './LeadFormSheet';

export function LeadDetailScreen({ id }: { id: number }) {
  const lead = useLead(id);
  return (
    <QueryBoundary query={lead} skeleton={<PageSkeleton rows={4} />} notFoundTitle="Lead not found">
      {(data) => <LeadDetail lead={data} />}
    </QueryBoundary>
  );
}

function LeadDetail({ lead }: { lead: Lead }) {
  const session = useSession();
  const toast = useToast();
  const { update } = useLeadMutations();
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [creatingOpportunity, setCreatingOpportunity] = useState(false);

  const isOwn =
    lead.assigned_to === session.user?.id ||
    (lead.assigned_to === null && lead.created_by === session.user?.id);
  const canEdit = session.canOrg('crm.leads.update') || (session.can('crm.leads.update') && isOwn);

  const changeStatus = (status: Lead['status']) =>
    update.mutate(
      { id: lead.id, input: { status } },
      {
        onSuccess: () =>
          toast.success(
            'Status updated',
            status === 'Converted' ? 'A customer record was created from this lead.' : status,
          ),
        onError: (error) => toast.error('Could not update status', errorMessage(error)),
      },
    );

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted">
        <Link href="/leads" className="hover:text-fg hover:underline">
          Leads
        </Link>{' '}
        / <span aria-current="page">{lead.full_name}</span>
      </nav>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {lead.full_name} <LeadStatusBadge status={lead.status} />
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Created {formatDate(lead.created_at)} · Updated {formatRelative(lead.updated_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PermissionGate permission="crm.calls.create">
            <CallButton leadId={lead.id} leadName={lead.full_name} />
          </PermissionGate>
          {canEdit && session.can('crm.followups.create') && (
            <Button onClick={() => setScheduling(true)}>Schedule follow-up</Button>
          )}
          {session.canOrg('crm.leads.assign') && (
            <Button onClick={() => setAssigning(true)}>Assign</Button>
          )}
          {canEdit && (
            <Button variant="primary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Contact">
            <DescriptionList
              items={[
                {
                  label: 'Mobile',
                  value: (
                    <a href={`tel:${lead.mobile_number}`} className="hover:underline">
                      {lead.mobile_number}
                    </a>
                  ),
                },
                { label: 'Alternate number', value: lead.alternate_number },
                {
                  label: 'Email',
                  value: lead.email ? (
                    <a href={`mailto:${lead.email}`} className="hover:underline">
                      {lead.email}
                    </a>
                  ) : null,
                },
                { label: 'Address', value: lead.address },
                { label: 'Occupation', value: lead.occupation },
                { label: 'Age', value: lead.age },
                {
                  label: 'Monthly income',
                  value: lead.monthly_income ? formatAmount(lead.monthly_income) : null,
                },
                {
                  label: 'Aware of digital gold',
                  value: lead.is_aware_of_digital_gold ? 'Yes' : 'No',
                },
              ]}
            />
            {lead.notes && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted">Notes</p>
                {/* Rendered as text: user content is never injected as HTML. */}
                <p className="mt-1 text-sm whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}
          </Card>

          <PermissionGate permission="crm.opportunities.read">
            <LeadOpportunities lead={lead} onCreate={() => setCreatingOpportunity(true)} />
          </PermissionGate>

          <PermissionGate anyOf={['crm.messages.read', 'crm.messages.send']}>
            <LeadMessagesCard lead={lead} />
          </PermissionGate>
        </div>

        <div className="space-y-4">
          <Card title="Status and ownership">
            <div className="space-y-3 text-sm">
              {canEdit ? (
                <label className="block">
                  <span className="text-xs font-medium text-muted">Status</span>
                  <Select
                    className="mt-1"
                    value={lead.status}
                    options={LEAD_STATUS_OPTIONS}
                    disabled={update.isPending}
                    onChange={(event) => changeStatus(event.target.value as Lead['status'])}
                  />
                </label>
              ) : null}
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  { label: 'Assigned to', value: lead.assigned_user_name ?? 'Unassigned' },
                  { label: 'Source', value: leadSourceLabel(lead.source) },
                  { label: 'Location', value: lead.location_name },
                  {
                    label: 'Next call',
                    value: lead.next_call_at ? (
                      <span
                        className={
                          isPast(lead.next_call_at) ? 'font-medium text-danger' : undefined
                        }
                      >
                        {formatDateTime(lead.next_call_at)}
                        {isPast(lead.next_call_at) && ' (overdue)'}
                      </span>
                    ) : (
                      'Not scheduled'
                    ),
                  },
                ]}
              />
            </div>
          </Card>
        </div>
      </div>

      <LeadFormSheet open={editing} lead={lead} onClose={() => setEditing(false)} />
      <AssignLeadDialog lead={assigning ? lead : null} onClose={() => setAssigning(false)} />
      <ScheduleFollowupDialog
        lead={scheduling ? lead : null}
        onClose={() => setScheduling(false)}
      />
      <OpportunityFormSheet
        open={creatingOpportunity}
        onClose={() => setCreatingOpportunity(false)}
        lead={{
          id: lead.id,
          full_name: lead.full_name,
          mobile_number: lead.mobile_number,
          email: lead.email,
        }}
      />
    </>
  );
}

function LeadOpportunities({ lead, onCreate }: { lead: Lead; onCreate: () => void }) {
  const opportunities = useOpportunities({ lead_id: lead.id, limit: 20 });
  const { can } = useSession();
  return (
    <Card
      title="Opportunities"
      actions={
        can('crm.opportunities.create') ? (
          <Button size="sm" onClick={onCreate}>
            New opportunity
          </Button>
        ) : undefined
      }
    >
      {opportunities.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : opportunities.data?.items.length ? (
        <ul className="divide-y divide-border">
          {opportunities.data.items.map((opportunity) => (
            <li
              key={opportunity.id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <Link
                href={`/opportunities?open=${opportunity.id}`}
                className="font-medium hover:underline"
              >
                {opportunity.title}
              </Link>
              <span className="flex items-center gap-2">
                <span className="text-muted tabular-nums">{formatAmount(opportunity.value)}</span>
                <Badge tone={STAGE_TONE[opportunity.stage]}>{opportunity.stage}</Badge>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No opportunities for this lead yet.</p>
      )}
    </Card>
  );
}

function LeadMessagesCard({ lead }: { lead: Lead }) {
  const { can } = useSession();
  const messages = useLeadMessages({ lead_id: lead.id, limit: 10 }, can('crm.messages.read'));
  return (
    <Card title="Messages">
      {can('crm.messages.send') && (
        <div className="mb-4">
          <SendMessageForm
            lead={{
              id: lead.id,
              full_name: lead.full_name,
              mobile_number: lead.mobile_number,
              email: lead.email,
            }}
          />
        </div>
      )}
      {can('crm.messages.read') &&
        (messages.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : messages.data?.items.length ? (
          <ul className="divide-y divide-border">
            {messages.data.items.map((message) => (
              <li key={message.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {message.message_type === 'SMS'
                      ? CHANNEL_LABEL.sms
                      : message.message_type === 'WhatsApp'
                        ? CHANNEL_LABEL.whatsapp
                        : message.message_type}{' '}
                    · {formatDateTime(message.sent_at)}
                  </span>
                  <Badge tone={MESSAGE_STATUS_TONE[message.status]}>{message.status}</Badge>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{message.content}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No messages yet" className="py-6" />
        ))}
    </Card>
  );
}
