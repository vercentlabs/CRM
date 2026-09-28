import { withTransaction } from '@crm/database';
import type { Call } from '@crm/types';
import type { endCallSchema } from '@crm/validation';
import type { z } from 'zod';
import { plivoTelephony, type Telephony } from '../../integrations/plivo.js';
import { pool } from '../../platform/db.js';
import { AppError } from '../../platform/http/errors.js';
import { ownerFilter, type Actor } from '../../platform/tenancy.js';
import * as leads from '../leads/leads.repository.js';
import * as calls from './calls.repository.js';

let telephony: Telephony = plivoTelephony;

/** Test seam: swap the telephony adapter (the service never sees vendor payloads). */
export function useTelephony(adapter: Telephony): void {
  telephony = adapter;
}

export async function listCalls(actor: Actor, paging: { limit: number; offset: number } | 'all') {
  const { rows, total } = await calls.list(
    pool,
    actor,
    ownerFilter(actor, 'crm.calls.read'),
    paging,
  );
  return { items: rows, total };
}

/**
 * Places a call to a lead. The CRM record is created first (Scheduled); the
 * telephony provider id is attached on success, the record cancelled on failure.
 */
export async function initiateCall(
  actor: Actor,
  leadId: number,
): Promise<{ call: Call; providerCallId: string }> {
  const lead = await leads.findForCall(pool, actor, leadId);
  if (!lead) throw AppError.notFound('Lead not found');
  if (ownerFilter(actor, 'crm.calls.create') !== null && !leads.isOwnLead(lead, actor.userId)) {
    throw AppError.forbidden('You can only initiate calls for leads assigned to you');
  }
  const phone = lead.mobile_number || lead.alternate_number;
  if (!phone) throw AppError.badRequest('Lead does not have a phone number');

  const callId = await calls.insertScheduled(pool, actor, leadId, actor.userId);
  try {
    const { callUuid } = await telephony.dial({
      from: process.env.PLIVO_PHONE_NUMBER,
      to: phone,
      answerUrl: `${process.env.PLIVO_WEBHOOK_URL}/answer`,
      metadata: { callId, leadId, userId: actor.userId },
    });
    await calls.setProviderCallId(pool, actor, callId, callUuid);
    return { call: (await calls.findById(pool, actor, callId))!, providerCallId: callUuid };
  } catch (error) {
    await calls.markCancelled(pool, actor, callId).catch(() => undefined);
    throw new AppError('SERVICE_UNAVAILABLE', 'Error making call via Plivo', { cause: error });
  }
}

/** Ends a call; own scope may only end calls they placed. */
export async function endCall(actor: Actor, id: number, input: z.output<typeof endCallSchema>) {
  const updatedFields = await withTransaction(pool, async (client) => {
    const call = await calls.lockById(client, actor, id);
    if (!call) throw AppError.notFound('Call not found');
    if (ownerFilter(actor, 'crm.calls.update') !== null && call.user_id !== actor.userId) {
      throw AppError.forbidden('You can only end calls that you initiated');
    }
    return calls.end(client, actor, id, {
      duration_seconds: input.duration_seconds,
      call_status: input.call_status ?? 'Completed',
      recording_url: input.recording_url,
    });
  });
  return { call: (await calls.findById(pool, actor, id))!, updatedFields };
}

// ------------------------------------------------------------------ provider webhooks
const STATUS_MAP: Record<string, string> = {
  completed: 'Completed',
  failed: 'Cancelled',
  busy: 'Missed',
  'no-answer': 'Missed',
  canceled: 'Cancelled',
};

const toNumber = (value: string | undefined) =>
  value && /^\d+$/.test(value) ? Number(value) : undefined;

/** Answer webhook: marks the call started and returns the bridging XML. */
export async function onCallAnswered(
  event: { callUuid?: string; from?: string; status?: string },
  recordActionUrl: string,
) {
  if (event.callUuid) {
    await calls.updateByProviderCallId(pool, event.callUuid, {
      call_status: event.status === 'in-progress' ? 'Completed' : STATUS_MAP[event.status ?? ''],
      start_time_now: true,
    });
  }
  return telephony.bridgeXml(event.from ?? '', recordActionUrl);
}

export async function onRecordingReady(event: {
  callUuid?: string;
  url?: string;
  duration?: string;
  recordingId?: string;
}) {
  if (!event.callUuid) return;
  await calls.updateByProviderCallId(pool, event.callUuid, {
    recording_url: event.url,
    duration_seconds: toNumber(event.duration),
    recording_id: event.recordingId,
  });
}

export async function onCallStatus(event: {
  callUuid?: string;
  status?: string;
  duration?: string;
}) {
  if (!event.callUuid) return;
  await calls.updateByProviderCallId(pool, event.callUuid, {
    call_status: STATUS_MAP[event.status ?? ''],
    duration_seconds: toNumber(event.duration),
    end_time_now: true,
  });
}
