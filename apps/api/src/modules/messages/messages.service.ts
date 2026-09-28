import { withTransaction } from '@crm/database';
import type { LeadMessage } from '@crm/types';
import type { bulkMessageSchema, sendMessageSchema } from '@crm/validation';
import type { z } from 'zod';
import { pool } from '../../platform/db.js';
import { AppError } from '../../platform/http/errors.js';
import { ownerFilter, type Actor } from '../../platform/tenancy.js';
import * as leads from '../leads/leads.repository.js';
import * as messages from './messages.repository.js';

/**
 * Lead messaging. Messages are recorded with status 'Sent'; there is no
 * provider dispatch yet ("message requested" is a Phase 6 event candidate).
 * API channels are lowercase; the messages_type_check constraint stores
 * 'SMS' / 'WhatsApp'.
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
  const id = await messages.insert(pool, actor, {
    lead_id: leadId,
    user_id: actor.userId,
    message_type: CHANNEL_TO_TYPE[input.channel],
    content: input.content,
  });
  return (await messages.findById(pool, actor, id))!;
}

/** All-or-nothing: every lead must be visible, and every row is written in one transaction. */
export async function sendBulk(
  actor: Actor,
  input: z.output<typeof bulkMessageSchema>,
): Promise<{ count: number; ids: number[] }> {
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
      created.push(
        await messages.insert(client, actor, {
          lead_id: leadId,
          user_id: actor.userId,
          message_type: CHANNEL_TO_TYPE[input.channel],
          content: input.content,
        }),
      );
    }
    return created;
  });
  return { count: ids.length, ids };
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
