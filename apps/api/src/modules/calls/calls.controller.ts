import { CALL_STATUSES, endCallSchema, initiateCallSchema } from '@crm/validation';
import { z } from 'zod';
import { idParams, offsetOf, pageQuery } from '../../platform/http/query.js';
import { controller, created, ok, paginationMeta } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import * as service from './calls.service.js';

export const callSchema = z.object({
  id: z.number(),
  lead_id: z.number(),
  user_id: z.number(),
  call_status: z.enum(CALL_STATUSES),
  start_time: z.string(),
  end_time: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  notes: z.string().nullable(),
  outcome: z.string().nullable(),
  plivo_call_uuid: z.string().nullable(),
  recording_url: z.string().nullable(),
  recording_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  lead_name: z.string(),
});

export const list = controller({
  query: z.object(pageQuery),
  handle: async ({ auth, query }) => {
    const { items, total } = await service.listCalls(actorFrom(auth), {
      limit: query.limit,
      offset: offsetOf(query),
    });
    return ok(items, paginationMeta(query.page, query.limit, total));
  },
});

export const initiate = controller({
  body: initiateCallSchema,
  handle: async ({ auth, body }) =>
    created((await service.initiateCall(actorFrom(auth), body.lead_id)).call),
});

export const end = controller({
  params: idParams,
  body: endCallSchema,
  handle: async ({ auth, params, body }) =>
    ok((await service.endCall(actorFrom(auth), params.id, body)).call),
});
