import { Router } from 'express';
import type { ApiModule } from '../platform/http/route.js';
import { auditModule } from './audit/audit.routes.js';
import { authModule } from './auth/auth.routes.js';
import { callsModule } from './calls/calls.routes.js';
import { plivoWebhookRouter } from './calls/calls.webhooks.js';
import { chatModule } from './chat/chat.routes.js';
import { customersModule } from './customers/customers.routes.js';
import { filesModule } from './files/files.routes.js';
import { followupsModule } from './followups/followups.routes.js';
import { leadsModule } from './leads/leads.routes.js';
import { locationsModule } from './locations/locations.routes.js';
import { marketModule } from './market/market.routes.js';
import { messagesModule } from './messages/messages.routes.js';
import { notificationsModule } from './notifications/notifications.routes.js';
import { notesModule } from './notes/notes.routes.js';
import { opportunitiesModule } from './opportunities/opportunities.routes.js';
import { organizationsModule } from './organizations/organizations.routes.js';
import { reportsModule } from './reports/reports.routes.js';
import { settingsModule } from './settings/settings.routes.js';
import { calendarModule, tasksModule } from './tasks/tasks.routes.js';
import { webhooksModule } from './webhooks/webhooks.routes.js';

/** Every `/api/v1` module. The registry drives routing and the OpenAPI document. */
export const apiModules: ApiModule[] = [
  authModule,
  organizationsModule,
  leadsModule,
  customersModule,
  opportunitiesModule,
  tasksModule,
  calendarModule,
  followupsModule,
  notesModule,
  callsModule,
  messagesModule,
  chatModule,
  filesModule,
  locationsModule,
  reportsModule,
  settingsModule,
  auditModule,
  marketModule,
  notificationsModule,
  webhooksModule,
];

/** Provider webhooks: stable, signature-verified URLs outside /api/v1 (not deprecated). */
export function createWebhookRouter(): Router {
  const router = Router();
  router.use('/api/plivo', plivoWebhookRouter());
  return router;
}
