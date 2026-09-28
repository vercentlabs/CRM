import type { Lead, LeadStatus } from '@crm/types';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import {
  Badge,
  Button,
  Card,
  Detail,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  SelectField,
  Text,
  useToast,
} from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatDateTime, formatNumber, formatRelative, isPast } from '../../lib/format';
import {
  LEAD_STATUS_OPTIONS,
  LEAD_STATUS_TONE,
  leadSourceLabel,
  MESSAGE_STATUS_TONE,
  messageFailureLabel,
  STAGE_TONE,
} from '../../lib/labels';
import type { RootScreenProps } from '../../navigation/types';
import { useSession } from '../../providers/SessionProvider';
import { CallSheet } from '../calls/CallSheet';
import { channelLabel, useLeadMessages } from '../messages/hooks';
import { SendMessageSheet } from '../messages/SendMessageSheet';
import { useLeadOpportunities } from '../opportunities/hooks';
import { useCanEditLead, useLead, useLeadMutations } from './hooks';
import { AssignSheet, ScheduleFollowupSheet } from './LeadSheets';

export function LeadDetailScreen({ route }: RootScreenProps<'LeadDetail'>) {
  const lead = useLead(route.params.id);
  if (lead.isPending)
    return (
      <Screen title="Lead" back>
        <LoadingState />
      </Screen>
    );
  if (lead.error)
    return (
      <Screen title="Lead" back>
        <ErrorState error={lead.error} onRetry={() => void lead.refetch()} />
      </Screen>
    );
  return <LeadDetail lead={lead.data} />;
}

function LeadDetail({ lead }: { lead: Lead }) {
  const navigation = useNavigation();
  const session = useSession();
  const toast = useToast();
  const canEdit = useCanEditLead()(lead);
  const { update } = useLeadMutations();
  const [sheet, setSheet] = useState<'assign' | 'followup' | 'call' | 'message' | null>(null);
  const close = () => setSheet(null);

  const changeStatus = (status: LeadStatus) =>
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
    <Screen
      title={lead.full_name}
      subtitle={`Created ${formatDate(lead.created_at)}`}
      back
      scroll
      actions={
        canEdit ? (
          <IconButton
            icon="edit-2"
            label="Edit lead"
            onPress={() => navigation.navigate('LeadForm', { id: lead.id })}
          />
        ) : null
      }
    >
      <View style={styles.row}>
        <Badge label={lead.status} tone={LEAD_STATUS_TONE[lead.status]} />
        {lead.next_call_at ? (
          <Badge
            label={`Next call ${isPast(lead.next_call_at) ? '(overdue) ' : ''}${formatRelative(lead.next_call_at)}`}
            tone={isPast(lead.next_call_at) ? 'danger' : 'info'}
          />
        ) : null}
      </View>

      <View style={styles.actions}>
        {session.can('crm.calls.create') ? (
          <Button label="Call" icon="phone" onPress={() => setSheet('call')} />
        ) : null}
        {session.can('crm.messages.send') ? (
          <Button label="Message" icon="message-square" onPress={() => setSheet('message')} />
        ) : null}
        {canEdit && session.can('crm.followups.create') ? (
          <Button label="Follow-up" icon="clock" onPress={() => setSheet('followup')} />
        ) : null}
        {session.canOrg('crm.leads.assign') ? (
          <Button label="Assign" icon="user-check" onPress={() => setSheet('assign')} />
        ) : null}
      </View>

      {canEdit ? (
        <SelectField
          label="Status"
          value={lead.status}
          options={LEAD_STATUS_OPTIONS}
          onChange={(value) => value && value !== lead.status && changeStatus(value as LeadStatus)}
          disabled={update.isPending}
        />
      ) : null}

      <Card title="Contact">
        <Detail
          label="Mobile"
          value={
            <Text
              color="primary"
              onPress={() => void Linking.openURL(`tel:${lead.mobile_number}`)}
              accessibilityRole="link"
            >
              {lead.mobile_number}
            </Text>
          }
        />
        <Detail label="Alternate number" value={lead.alternate_number} />
        <Detail label="Email" value={lead.email} />
        <Detail label="Address" value={lead.address} />
      </Card>

      <Card title="Ownership">
        <Detail label="Assigned to" value={lead.assigned_user_name ?? 'Unassigned'} />
        <Detail label="Source" value={leadSourceLabel(lead.source)} />
        <Detail label="Location" value={lead.location_name} />
        <Detail
          label="Next call"
          value={lead.next_call_at ? formatDateTime(lead.next_call_at) : 'Not scheduled'}
        />
      </Card>

      <Card title="Profile">
        <Detail label="Occupation" value={lead.occupation} />
        <Detail label="Age" value={lead.age} />
        <Detail
          label="Monthly income"
          value={lead.monthly_income ? formatNumber(lead.monthly_income) : null}
        />
        <Detail
          label="Aware of digital gold"
          value={lead.is_aware_of_digital_gold ? 'Yes' : 'No'}
        />
        {/* Plain text: user content is never rendered as HTML. */}
        {lead.notes ? <Detail label="Notes" value={lead.notes} /> : null}
      </Card>

      {session.can('crm.opportunities.read') ? <LeadOpportunities lead={lead} /> : null}
      {session.can('crm.messages.read') ? <LeadMessages lead={lead} /> : null}

      <AssignSheet lead={sheet === 'assign' ? lead : null} onClose={close} />
      <ScheduleFollowupSheet lead={sheet === 'followup' ? lead : null} onClose={close} />
      <CallSheet lead={sheet === 'call' ? lead : null} onClose={close} />
      <SendMessageSheet lead={sheet === 'message' ? lead : null} onClose={close} />
    </Screen>
  );
}

function LeadOpportunities({ lead }: { lead: Lead }) {
  const navigation = useNavigation();
  const { can } = useSession();
  const opportunities = useLeadOpportunities(lead.id);
  return (
    <Card
      title="Opportunities"
      action={
        can('crm.opportunities.create') ? (
          <Button
            label="Add"
            icon="plus"
            variant="ghost"
            onPress={() => navigation.navigate('OpportunityForm', { leadId: lead.id })}
          />
        ) : undefined
      }
    >
      {opportunities.isPending ? (
        <Text color="muted">Loading…</Text>
      ) : opportunities.data?.items.length ? (
        opportunities.data.items.map((o) => (
          <View key={o.id} style={styles.item}>
            <Text
              variant="label"
              style={{ flex: 1 }}
              onPress={() => navigation.navigate('OpportunityForm', { id: o.id })}
              accessibilityRole="link"
            >
              {o.title}
            </Text>
            <Badge label={o.stage} tone={STAGE_TONE[o.stage]} />
          </View>
        ))
      ) : (
        <Text color="muted">No opportunities for this lead yet.</Text>
      )}
    </Card>
  );
}

function LeadMessages({ lead }: { lead: Lead }) {
  const messages = useLeadMessages(lead.id);
  return (
    <Card title="Recent messages">
      {messages.isPending ? (
        <Text color="muted">Loading…</Text>
      ) : messages.data?.items.length ? (
        messages.data.items.map((m) => (
          <View key={m.id} style={styles.message}>
            <View style={styles.item}>
              <Text variant="caption" color="muted" style={{ flex: 1 }}>
                {channelLabel(m.message_type)} · {formatDateTime(m.sent_at ?? m.created_at)}
                {m.status === 'Failed' && m.failure_code
                  ? ` · ${messageFailureLabel(m.failure_code)}`
                  : ''}
              </Text>
              <Badge label={m.status} tone={MESSAGE_STATUS_TONE[m.status]} />
            </View>
            <Text>{m.content}</Text>
          </View>
        ))
      ) : (
        <Text color="muted">No messages yet.</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  message: { gap: 4, paddingVertical: 4 },
});
