import type { ApiModule } from '../../platform/http/route.js';
import * as reports from './reports.controller.js';
import {
  conversionSchema,
  dashboardSchema,
  leadAgingSchema,
  leadsOverTimeSchema,
  salesPerformanceSchema,
} from './reports.controller.js';

const tags = ['Reports'];

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
