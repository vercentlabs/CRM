import { z } from 'zod';
import { booleanQuery, idParams } from '../../platform/http/query.js';
import { controller, ok } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import * as service from './followups.service.js';

export const schedule = controller({
  query: z.object({ overdue: booleanQuery }),
  handle: async ({ auth, query }) =>
    ok(await service.listSchedule(actorFrom(auth), query.overdue === true)),
});

export const complete = controller({
  params: idParams,
  handle: async ({ auth, params }) =>
    ok(await service.completeFollowup(actorFrom(auth), params.id)),
});
