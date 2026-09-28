'use client';

import type { LeadMessage } from '@crm/types';
import { Badge, Card, EmptyState, PageHeader, buttonClass } from '@crm/ui';
import Link from 'next/link';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { useListParams } from '@/hooks/useListParams';
import { formatDateTime } from '@/lib/format';
import { MESSAGE_STATUS_TONE } from '@/lib/labels';
import { useSession } from '@/providers/SessionProvider';
import { useLeadMessages } from './hooks';
import { SendMessageForm } from './SendMessageForm';

const channelLabel = (type: LeadMessage['message_type']) => (type === 'SMS' ? 'SMS' : type);

/** Messages sent to leads (SMS/WhatsApp); distinct from internal team chat. */
export function MessagesScreen() {
  const { can } = useSession();
  const { page, setParams } = useListParams([] as const);
  const messages = useLeadMessages({ page, limit: 20 }, can('crm.messages.read'));

  const columns: Column<LeadMessage>[] = [
    {
      id: 'lead',
      header: 'Lead',
      cell: (m) => (
        <Link
          href={`/leads/${m.lead_id}`}
          className="font-medium hover:text-primary hover:underline"
        >
          {m.lead_name}
        </Link>
      ),
    },
    { id: 'channel', header: 'Channel', cell: (m) => channelLabel(m.message_type) },
    {
      id: 'content',
      header: 'Message',
      cell: (m) => <p className="line-clamp-2 max-w-md whitespace-pre-wrap">{m.content}</p>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (m) => <Badge tone={MESSAGE_STATUS_TONE[m.status]}>{m.status}</Badge>,
    },
    { id: 'sent', header: 'Sent', hideBelow: 'md', cell: (m) => formatDateTime(m.sent_at) },
  ];

  return (
    <>
      <PageHeader
        title="Lead messages"
        description="SMS and WhatsApp messages to leads"
        actions={
          <PermissionGate permission="crm.messages.send">
            <Link href="/messages/bulk" className={buttonClass('secondary')}>
              Bulk message
            </Link>
          </PermissionGate>
        }
      />
      <div className="space-y-4">
        <PermissionGate permission="crm.messages.send">
          <Card title="Send a message">
            <SendMessageForm />
          </Card>
        </PermissionGate>
        <PermissionGate permission="crm.messages.read">
          <DataTable
            caption="Sent messages"
            columns={columns}
            rows={messages.data?.items}
            rowKey={(m) => m.id}
            loading={messages.isPending}
            error={messages.error}
            onRetry={() => void messages.refetch()}
            pagination={messages.data?.pagination}
            onPageChange={(next) => setParams({ page: next })}
            empty={<EmptyState title="No messages sent yet" />}
          />
        </PermissionGate>
      </div>
    </>
  );
}
