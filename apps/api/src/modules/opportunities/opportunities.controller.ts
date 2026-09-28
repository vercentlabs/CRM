import {
  assignmentSchema,
  createOpportunitySchema,
  OPPORTUNITY_STAGES,
  updateOpportunitySchema,
} from '@crm/validation';
import { z } from 'zod';
import { idParams, optionalId, pageQuery, sortQuery } from '../../platform/http/query.js';
import { controller, created, ok, paginationMeta } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import { OPPORTUNITY_SORTS } from './opportunities.repository.js';
import * as service from './opportunities.service.js';

export const opportunitySchema = z.object({
  id: z.number(),
  lead_id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  value: z.string().nullable(),
  stage: z.enum(OPPORTUNITY_STAGES),
  probability: z.number().nullable(),
  expected_close_date: z.string().nullable(),
  created_by: z.number(),
  assigned_to: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  lead_name: z.string().nullable(),
  lead_email: z.string().nullable(),
  assigned_to_name: z.string().nullable(),
});

const listQuery = z.object({
  ...pageQuery,
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  lead_id: optionalId,
  sort: sortQuery(OPPORTUNITY_SORTS, '-created_at'),
});

export const list = controller({
  query: listQuery,
  handle: async ({ auth, query }) => {
    const { items, total } = await service.listOpportunities(actorFrom(auth), {
      stage: query.stage,
      leadId: query.lead_id,
      orderBy: query.sort,
      page: query.page,
      limit: query.limit,
    });
    return ok(items, paginationMeta(query.page, query.limit, total));
  },
});

export const get = controller({
  params: idParams,
  handle: async ({ auth, params }) => ok(await service.getOpportunity(actorFrom(auth), params.id)),
});

export const create = controller({
  body: createOpportunitySchema,
  handle: async ({ auth, body }) => created(await service.createOpportunity(actorFrom(auth), body)),
});

export const update = controller({
  params: idParams,
  body: updateOpportunitySchema,
  handle: async ({ auth, params, body }) =>
    ok((await service.updateOpportunity(actorFrom(auth), params.id, body)).opportunity),
});

export const assign = controller({
  params: idParams,
  body: assignmentSchema,
  handle: async ({ auth, params, body }) =>
    ok(await service.assignOpportunity(actorFrom(auth), params.id, body)),
});
