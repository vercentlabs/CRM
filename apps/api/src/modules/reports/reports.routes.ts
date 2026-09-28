import { Router } from 'express';
import { z } from 'zod';
import { legacyRoute } from '../../platform/http/legacy.js';
import type { ApiModule } from '../../platform/http/route.js';
import * as reports from './reports.controller.js';
import {
  conversionQuery,
  conversionSchema,
  dashboardSchema,
  leadAgingSchema,
  leadsOverTimeSchema,
  periodQuery,
  salesPerformanceQuery,
  salesPerformanceSchema,
} from './reports.controller.js';
import * as service from './reports.service.js';

const tags = ['Reports'];

/** Legacy callers sent `userId`; v1 uses `user_id`. */
const acceptUserId = <S extends z.ZodType>(schema: S) =>
  z.preprocess((query) => {
    const q = (query ?? {}) as Record<string, unknown>;
    return { ...q, user_id: q.user_id ?? q.userId };
  }, schema);

export const reportsModule: ApiModule = {
  name: 'reports',
  routes: [
    {
      method: 'get',
      path: '/reports/dashboard-summary',
      summary: 'Dashboard counters',
      tags,
      permission: 'crm.reports.read',
      controller: reports.dashboard,
      response: dashboardSchema,
    },
    {
      method: 'get',
      path: '/reports/sales-performance',
      summary: 'Per-member performance (organization scope)',
      tags,
      permission: 'crm.reports.read',
      scope: 'organization',
      controller: reports.salesPerformance,
      response: salesPerformanceSchema,
    },
    {
      method: 'get',
      path: '/reports/lead-aging',
      summary: 'Lead aging buckets',
      tags,
      permission: 'crm.reports.read',
      controller: reports.leadAging,
      response: leadAgingSchema,
    },
    {
      method: 'get',
      path: '/reports/conversion',
      summary: 'Lead counts by status',
      tags,
      permission: 'crm.reports.read',
      controller: reports.conversion,
      response: conversionSchema,
    },
    {
      method: 'get',
      path: '/reports/leads-over-time',
      summary: 'New leads bucketed by hour/day/week',
      tags,
      permission: 'crm.reports.read',
      controller: reports.leadsOverTime,
      response: leadsOverTimeSchema,
    },
    {
      method: 'get',
      path: '/reports/leads-export',
      summary: 'Export leads as CSV (own scope: my leads)',
      tags,
      permission: 'crm.reports.export',
      controller: reports.exportLeads,
      produces: 'text/csv',
    },
  ],
};

/** DEPRECATED `/reports/*` adapters (raw bodies, no envelope) → reports.service. */
export function legacyReportsRouter(): Router {
  const router = Router();

  router.get(
    '/dashboard-summary',
    ...legacyRoute({
      permission: 'crm.reports.read',
      handle: async ({ actor, res }) => {
        res.status(200).json(await service.dashboardSummary(actor));
      },
    }),
  );

  router.get(
    '/sales-performance',
    ...legacyRoute({
      permission: 'crm.reports.read',
      scope: 'organization',
      query: acceptUserId(salesPerformanceQuery),
      handle: async ({ actor, query, res }) => {
        res
          .status(200)
          .json({ data: await service.salesPerformance(actor, query.days, query.user_id) });
      },
    }),
  );

  router.get(
    '/lead-aging',
    ...legacyRoute({
      permission: 'crm.reports.read',
      handle: async ({ actor, res }) => {
        res.status(200).json(await service.leadAging(actor));
      },
    }),
  );

  router.get(
    '/conversion-report',
    ...legacyRoute({
      permission: 'crm.reports.read',
      query: acceptUserId(conversionQuery),
      handle: async ({ actor, query, res }) => {
        res
          .status(200)
          .json(await service.conversion(actor, { days: query.days, memberId: query.user_id }));
      },
    }),
  );

  router.get(
    '/export-leads-csv',
    ...legacyRoute({
      permission: 'crm.reports.export',
      handle: async ({ actor, res }) => {
        const csv = await service.leadsCsv(actor);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=leads_export.csv');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(csv);
      },
    }),
  );

  router.get(
    '/leads-over-time',
    ...legacyRoute({
      permission: 'crm.reports.read',
      query: periodQuery,
      handle: async ({ actor, query, res }) => {
        res.status(200).json(await service.leadsOverTime(actor, query.period));
      },
    }),
  );

  return router;
}
