import { Router } from 'express';
import type { ApiModule } from '../platform/http/route.js';
import { auditModule, legacyAuditRouter } from './audit/audit.routes.js';
import { legacyAuthRouter, legacyPasswordRouter } from './auth/auth.legacy.js';
import { authModule } from './auth/auth.routes.js';
import { legacyCallsRouter } from './calls/calls.legacy.js';
import { callsModule } from './calls/calls.routes.js';
import { plivoWebhookRouter } from './calls/calls.webhooks.js';
import { legacyChatRouter } from './chat/chat.legacy.js';
import { chatModule } from './chat/chat.routes.js';
import { legacyCustomersRouter } from './customers/customers.legacy.js';
import { customersModule } from './customers/customers.routes.js';
import { filesModule, legacyUploadRouter } from './files/files.routes.js';
import { legacyFollowupsRouter } from './followups/followups.legacy.js';
import { followupsModule } from './followups/followups.routes.js';
import { legacyLeadsRouter } from './leads/leads.legacy.js';
import { leadsModule } from './leads/leads.routes.js';
import { legacyLocationsRouter, locationsModule } from './locations/locations.routes.js';
import { legacyGoldRouter, marketModule } from './market/market.routes.js';
import { legacyMessagesRouter } from './messages/messages.legacy.js';
import { messagesModule } from './messages/messages.routes.js';
import { legacyNotesRouter } from './notes/notes.legacy.js';
import { notesModule } from './notes/notes.routes.js';
import { legacyOpportunitiesRouter } from './opportunities/opportunities.legacy.js';
import { opportunitiesModule } from './opportunities/opportunities.routes.js';
import { organizationsModule } from './organizations/organizations.routes.js';
import { legacyAdminRouter, legacyUsersRouter } from './organizations/users.legacy.js';
import { legacyReportsRouter, reportsModule } from './reports/reports.routes.js';
import { legacySettingsRouter, settingsModule } from './settings/settings.routes.js';
import { legacyCalendarRouter, legacyTasksRouter } from './tasks/tasks.legacy.js';
import { calendarModule, tasksModule } from './tasks/tasks.routes.js';

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
];

/**
 * DEPRECATED unversioned endpoints still used by the web (until Phase 4) and
 * mobile (until Phase 5) clients. Each is a thin adapter over the same module
 * service as its /api/v1 counterpart. Responses carry `Deprecation: true`.
 */
export function createLegacyRouter(): Router {
  const router = Router();
  router.use('/auth', legacyAuthRouter());
  router.use('/admin', legacyAdminRouter());
  router.use('/users', legacyPasswordRouter(), legacyUsersRouter());
  router.use('/leads', legacyLeadsRouter());
  router.use('/followups', legacyFollowupsRouter());
  router.use('/calls', legacyCallsRouter());
  router.use('/messages', legacyMessagesRouter());
  router.use('/api/lead-messages', legacyMessagesRouter());
  router.use('/customers', legacyCustomersRouter());
  router.use('/gold', legacyGoldRouter());
  router.use('/reports', legacyReportsRouter());
  router.use('/audit', legacyAuditRouter());
  router.use('/sales-locations', legacyLocationsRouter());
  router.use('/opportunities', legacyOpportunitiesRouter());
  router.use('/tasks', legacyTasksRouter());
  router.use('/notes', legacyNotesRouter());
  router.use('/calendar', legacyCalendarRouter());
  router.use('/api/chat', legacyChatRouter());
  router.use('/settings', legacySettingsRouter());
  router.use('/api/upload', legacyUploadRouter());
  return router;
}

/** Provider webhooks: stable, signature-verified URLs (not deprecated). */
export function createWebhookRouter(): Router {
  const router = Router();
  router.use('/api/plivo', plivoWebhookRouter());
  return router;
}
