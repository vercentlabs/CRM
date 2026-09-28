import type { FollowupScheduleItem } from '@crm/types';
import { createFollowupSchema } from '@crm/validation';
import { Router } from 'express';
import { AppError } from '../../platform/http/errors.js';
import { legacyId, legacyRoute } from '../../platform/http/legacy.js';
import { parseId } from '../../platform/tenancy.js';
import { createFollowupForLead } from '../leads/leads.service.js';
import * as service from './followups.service.js';

/** Historical list item shape (the lead id doubles as the follow-up id). */
const toLegacyItem = (row: FollowupScheduleItem) => ({
  id: row.lead_id,
  lead_id: row.lead_id,
  assignedTo: { id: row.assigned_to, name: row.assigned_to_name },
  followup_date: row.next_call_at,
  scheduled_at: row.next_call_at,
  followup_type: 'Call',
  notes: '',
  status: 'Pending',
  completed: false,
  lead: {
    id: row.lead_id,
    name: row.lead_name,
    email: row.lead_email,
    mobile_number: row.lead_mobile,
    status: row.lead_status,
    next_call_at: row.next_call_at,
  },
});

/** DEPRECATED `/followups/*` adapters → followups.service / leads.service. */
export function legacyFollowupsRouter(): Router {
  const router = Router();

  // Historically this route expected a :leadId param it never had; it now accepts `leadId` in the body.
  router.post(
    '/',
    ...legacyRoute({
      permission: 'crm.followups.create',
      body: createFollowupSchema,
      handle: async ({ actor, body, req, res }) => {
        const leadId = parseId((req.body as { leadId?: unknown }).leadId);
        if (leadId === null) throw AppError.badRequest('leadId must be a numeric value');
        const { followup, lead } = await createFollowupForLead(actor, leadId, body);
        res.status(201).json({ message: 'Followup created successfully', followup, lead });
      },
    }),
  );

  router.get(
    '/',
    ...legacyRoute({
      permission: 'crm.followups.read',
      handle: async ({ actor, res }) => {
        const rows = await service.listSchedule(actor, false);
        res
          .status(200)
          .json({ message: 'Followups retrieved successfully', followups: rows.map(toLegacyItem) });
      },
    }),
  );

  router.get(
    '/overdue',
    ...legacyRoute({
      permission: 'crm.followups.read',
      handle: async ({ actor, res }) => {
        const rows = await service.listSchedule(actor, true);
        res.status(200).json({
          message: 'Overdue followups retrieved successfully',
          followups: rows.map(toLegacyItem),
        });
      },
    }),
  );

  router.patch(
    '/:id/complete',
    ...legacyRoute({
      permission: 'crm.followups.update',
      handle: async ({ actor, req, res }) => {
        await service.completeFollowup(actor, legacyId(req.params.id, 'Followup not found'));
        res.status(200).json({ message: 'Followup completed successfully' });
      },
    }),
  );

  router.patch(
    '/:id/overdue',
    ...legacyRoute({
      permission: 'crm.followups.update',
      handle: async ({ actor, req, res }) => {
        await service.markFollowupOverdue(actor, legacyId(req.params.id, 'Followup not found'));
        res.status(200).json({ message: 'Followup marked as overdue successfully' });
      },
    }),
  );

  return router;
}
