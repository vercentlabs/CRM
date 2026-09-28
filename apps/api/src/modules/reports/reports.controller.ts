import { z } from 'zod';
import { optionalId } from '../../platform/http/query.js';
import { controller, ok } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import * as service from './reports.service.js';

const days = z.coerce
  .number()
  .int()
  .min(1, 'days must be an integer between 1 and 3650')
  .max(3650, 'days must be an integer between 1 and 3650');

export const salesPerformanceQuery = z.object({ days: days.default(30), user_id: optionalId });
export const conversionQuery = z.object({ days: days.optional(), user_id: optionalId });
export const periodQuery = z.object({
  period: z.enum(['today', 'week', 'month']).default('month'),
});

export const dashboardSchema = z.object({
  totalLeads: z.number(),
  leadsByStatus: z.array(z.object({ status: z.string(), count: z.number() })),
  pendingFollowups: z.number(),
  overdueFollowups: z.number(),
  callsToday: z.number(),
  messagesToday: z.number(),
});
export const salesPerformanceSchema = z.array(
  z.object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    totalLeads: z.number(),
    convertedLeads: z.number(),
    conversionRate: z.number(),
  }),
);
export const leadAgingSchema = z.object({
  '0-1_days': z.number(),
  '2-3_days': z.number(),
  '4-7_days': z.number(),
  '7+_days': z.number(),
});
export const conversionSchema = z.record(z.string(), z.number());
export const leadsOverTimeSchema = z.array(z.object({ time: z.string(), leads: z.number() }));

export const dashboard = controller({
  handle: async ({ auth }) => ok(await service.dashboardSummary(actorFrom(auth))),
});

export const salesPerformance = controller({
  query: salesPerformanceQuery,
  handle: async ({ auth, query }) =>
    ok(await service.salesPerformance(actorFrom(auth), query.days, query.user_id)),
});

export const leadAging = controller({
  handle: async ({ auth }) => ok(await service.leadAging(actorFrom(auth))),
});

export const conversion = controller({
  query: conversionQuery,
  handle: async ({ auth, query }) =>
    ok(await service.conversion(actorFrom(auth), { days: query.days, memberId: query.user_id })),
});

export const leadsOverTime = controller({
  query: periodQuery,
  handle: async ({ auth, query }) => ok(await service.leadsOverTime(actorFrom(auth), query.period)),
});

export const exportLeads = controller({
  handle: async ({ auth, res }) => {
    const csv = await service.leadsCsv(actorFrom(auth));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_export.csv');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(csv);
    return undefined;
  },
});
