import { withTransaction } from '@crm/database';
import type { LeadMessage } from '@crm/types';
import type { bulkMessageSchema, sendMessageSchema } from '@crm/validation';
import type { z } from 'zod';
import { pool } from '../../platform/db.js';
import { requireFeature } from '../../platform/entitlements.js';
import { emit } from '../../platform/events.js';
import { AppError } from '../../platform/http/errors.js';
import { ownerFilter, type Actor } from '../../platform/tenancy.js';
import * as leads from '../leads/leads.repository.js';
import * as messages from './messages.repository.js';

/**
 * Lead messaging. A send request stores the message as 'Queued' and emits
 * `message.requested` in the same transaction; the worker then calls the
 * provider and moves it to Sent / Failed (and Delivered from the provider's
 * callback). The API never reports a message as sent before the provider
 * accepted it. API channels are lowercase; the messages_type_check constraint
 * stores 'SMS' / 'WhatsApp'.
 */
const CHANNEL_TO_TYPE = { sms: 'SMS', whatsapp: 'WhatsApp' } as const;

export async function listMessages(
  actor: Actor,
  leadId: number | undefined,
  paging: { limit: number; offset: number } | 'all',
) {
  const { rows, total } = await messages.list(
    pool,
    actor,
    { ownerId: ownerFilter(actor, 'crm.messages.read'), leadId },
    paging,
  );
  return { items: rows, total };
}

export async function sendMessage(
  actor: Actor,
  input: z.output<typeof sendMessageSchema>,
): Promise<LeadMessage> {
  const [leadId] = await leads.visibleIds(
    pool,
    actor,
    [input.lead_id],
    ownerFilter(actor, 'crm.messages.send'),
  );
  // Same answer for "missing", "other organization" and "not yours".
  if (!leadId) throw AppError.notFound('Lead not found');
  const id = await withTransaction(pool, async (tx) => {
    const created = await messages.insert(tx, actor, {
      lead_id: leadId,
      user_id: actor.userId,
      message_type: CHANNEL_TO_TYPE[input.channel],
      content: input.content,
    });
    await emit(tx, actor, 'message.requested', created, {
      messageId: created,
      leadId,
      channel: input.channel,
    });
    return created;
  });
  return (await messages.findById(pool, actor, id))!;
}

/** All-or-nothing: every lead must be visible, and every row is written in one transaction. */
export async function sendBulk(
  actor: Actor,
  input: z.output<typeof bulkMessageSchema>,
): Promise<{ count: number; ids: number[] }> {
  await requireFeature(actor, 'messages.bulk');
  const requested = [...new Set(input.lead_ids)];
  const visible = await leads.visibleIds(
    pool,
    actor,
    requested,
    ownerFilter(actor, 'crm.messages.send'),
  );
  if (visible.length !== requested.length)
    throw AppError.notFound('One or more leads were not found');
  const ids = await withTransaction(pool, async (client) => {
    const created: number[] = [];
    for (const leadId of visible) {
      const messageId = await messages.insert(client, actor, {
        lead_id: leadId,
        user_id: actor.userId,
        message_type: CHANNEL_TO_TYPE[input.channel],
        content: input.content,
      });
      await emit(client, actor, 'message.requested', messageId, {
        messageId,
        leadId,
        channel: input.channel,
      });
      created.push(messageId);
    }
    return created;
  });
  return { count: ids.length, ids };
}

/** Plivo SMS delivery report (signature already verified by the webhook router). */
export async function onProviderStatus(report: {
  messageUuid: string | undefined;
  status: string | undefined;
  errorCode: string | undefined;
}): Promise<void> {
  if (!report.messageUuid || !report.status) return;
  const status = report.status.toLowerCase();
  const outcome =
    status === 'delivered'
      ? 'delivered'
      : ['failed', 'undelivered', 'rejected'].includes(status)
        ? 'failed'
        : null;
  if (!outcome) return; // queued / sent: nothing new to record
  await messages.applyProviderReport(pool, {
    provider: 'plivo',
    providerMessageId: report.messageUuid,
    outcome,
    failureCode:
      outcome === 'failed'
        ? `PROVIDER_${(report.errorCode ?? 'UNDELIVERED').replace(/[^A-Za-z0-9_]/g, '').slice(0, 30)}`
        : null,
  });
}

export async function updateStatus(actor: Actor, id: number, status: string): Promise<LeadMessage> {
  const updated = await messages.setStatus(
    pool,
    actor,
    id,
    status,
    ownerFilter(actor, 'crm.messages.update'),
  );
  if (!updated) throw AppError.notFound('Message not found');
  return (await messages.findById(pool, actor, id))!;
}
