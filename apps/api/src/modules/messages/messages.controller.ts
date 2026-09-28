import {
  bulkMessageSchema,
  MESSAGE_DELIVERY_STATUSES,
  messageStatusSchema,
  sendMessageSchema,
} from '@crm/validation';
import { z } from 'zod';
import { idParams, offsetOf, optionalId, pageQuery } from '../../platform/http/query.js';
import { controller, created, ok, paginationMeta } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import * as service from './messages.service.js';

export const leadMessageSchema = z.object({
  id: z.number(),
  lead_id: z.number(),
  user_id: z.number(),
  message_type: z.enum(['SMS', 'Email', 'WhatsApp']),
  subject: z.string().nullable(),
  content: z.string(),
  status: z.enum(MESSAGE_DELIVERY_STATUSES),
  sent_at: z.string().nullable(),
  created_at: z.string(),
  queued_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  failed_at: z.string().nullable(),
  failure_code: z.string().nullable(),
  lead_name: z.string(),
});

export const list = controller({
  query: z.object({ ...pageQuery, lead_id: optionalId }),
  handle: async ({ auth, query }) => {
    const { items, total } = await service.listMessages(actorFrom(auth), query.lead_id, {
      limit: query.limit,
      offset: offsetOf(query),
    });
    return ok(items, paginationMeta(query.page, query.limit, total));
  },
});

export const send = controller({
  body: sendMessageSchema,
  handle: async ({ auth, body }) => created(await service.sendMessage(actorFrom(auth), body)),
});

export const sendBulk = controller({
  body: bulkMessageSchema,
  handle: async ({ auth, body }) => created(await service.sendBulk(actorFrom(auth), body)),
});

export const setStatus = controller({
  params: idParams,
  body: messageStatusSchema,
  handle: async ({ auth, params, body }) =>
    ok(await service.updateStatus(actorFrom(auth), params.id, body.status)),
});
