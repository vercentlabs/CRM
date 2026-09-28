import { controller, created, ok, paginationMeta } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import {
  assignmentSchema,
  createFollowupSchema,
  createLeadSchema,
  leadIdParams,
  listLeadsQuery,
  updateLeadSchema,
} from './leads.schemas.js';
import * as service from './leads.service.js';

export const list = controller({
  query: listLeadsQuery,
  handle: async ({ auth, query }) => {
    const { items, total } = await service.listLeads(actorFrom(auth), {
      status: query.status,
      assignedTo: query.assigned_to,
      dateFrom: query.date_from,
      dateTo: query.date_to,
      search: query.search,
      orderBy: query.sort,
      page: query.page,
      limit: query.limit,
    });
    return ok(items, paginationMeta(query.page, query.limit, total));
  },
});

export const get = controller({
  params: leadIdParams,
  handle: async ({ auth, params }) => ok(await service.getLead(actorFrom(auth), params.id)),
});

export const create = controller({
  body: createLeadSchema,
  handle: async ({ auth, body }) => created(await service.createLead(actorFrom(auth), body)),
});

export const update = controller({
  params: leadIdParams,
  body: updateLeadSchema,
  handle: async ({ auth, params, body }) =>
    ok((await service.updateLead(actorFrom(auth), params.id, body)).lead),
});

export const assign = controller({
  params: leadIdParams,
  body: assignmentSchema,
  handle: async ({ auth, params, body }) =>
    ok(await service.assignLead(actorFrom(auth), params.id, body)),
});

export const createFollowup = controller({
  params: leadIdParams,
  body: createFollowupSchema,
  handle: async ({ auth, params, body }) =>
    created((await service.createFollowupForLead(actorFrom(auth), params.id, body)).followup),
});
