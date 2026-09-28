import { Router } from 'express';
import { AppError } from '../../platform/http/errors.js';
import { legacyId, legacyPage, legacyPagination, legacyRoute } from '../../platform/http/legacy.js';
import { parseId } from '../../platform/tenancy.js';
import {
  assignmentSchema,
  createFollowupSchema,
  createLeadSchema,
  updateLeadSchema,
} from './leads.schemas.js';
import * as service from './leads.service.js';

/** DEPRECATED `/leads/*` adapters (historical shapes) → leads.service. */
export function legacyLeadsRouter(): Router {
  const router = Router();

  router.post(
    '/',
    ...legacyRoute({
      permission: 'crm.leads.create',
      body: createLeadSchema,
      handle: async ({ actor, body, res }) => {
        const lead = await service.createLead(actor, body);
        res.status(201).json({ message: 'Lead created successfully', lead });
      },
    }),
  );

  router.get(
    '/',
    ...legacyRoute({
      permission: 'crm.leads.read',
      handle: async ({ actor, req, res }) => {
        const { page, limit } = legacyPage(req.query);
        const { status, assignedTo, dateFrom, dateTo } = req.query as Record<
          string,
          string | undefined
        >;
        for (const [name, value] of [
          ['dateFrom', dateFrom],
          ['dateTo', dateTo],
        ] as const) {
          if (value && Number.isNaN(Date.parse(value))) {
            throw AppError.badRequest(`Invalid ${name} format. Please use YYYY-MM-DD format.`);
          }
        }
        const { items, total } = await service.listLeads(actor, {
          status,
          assignedTo: assignedTo ? (parseId(assignedTo) ?? 0) : undefined,
          dateFrom,
          dateTo,
          orderBy: 'l.created_at DESC',
          page,
          limit,
        });
        res.status(200).json({
          // Historical list shape aliases full_name as `name`.
          leads: items.map(({ full_name, location_name: _location, ...lead }) => ({
            ...lead,
            name: full_name,
          })),
          pagination: legacyPagination(page, limit, total),
        });
      },
    }),
  );

  router.get(
    '/:id',
    ...legacyRoute({
      permission: 'crm.leads.read',
      handle: async ({ actor, req, res }) => {
        const lead = await service.getLead(actor, legacyId(req.params.id, 'Lead not found'));
        res.status(200).json({ success: true, lead });
      },
    }),
  );

  router.patch(
    '/:leadId/assign',
    ...legacyRoute({
      permission: 'crm.leads.assign',
      scope: 'organization',
      body: assignmentSchema,
      handle: async ({ actor, body, req, res }) => {
        const leadId = legacyId(req.params.leadId, 'Lead not found');
        await service.assignLead(actor, leadId, body);
        res
          .status(200)
          .json({ message: 'Lead assigned successfully', leadId, assignedTo: body.assigned_to });
      },
    }),
  );

  router.put(
    '/:id',
    ...legacyRoute({
      permission: 'crm.leads.update',
      body: updateLeadSchema,
      handle: async ({ actor, body, req, res }) => {
        const leadId = legacyId(req.params.id, 'Lead not found');
        const { updatedFields } = await service.updateLead(actor, leadId, body);
        res.status(200).json({ message: 'Lead updated successfully', leadId, updatedFields });
      },
    }),
  );

  router.post(
    '/:leadId/followups',
    ...legacyRoute({
      permission: 'crm.followups.create',
      body: createFollowupSchema,
      handle: async ({ actor, body, req, res }) => {
        const leadId = legacyId(req.params.leadId, 'Lead not found');
        const { followup, lead } = await service.createFollowupForLead(actor, leadId, body);
        res.status(201).json({ message: 'Followup created successfully', followup, lead });
      },
    }),
  );

  return router;
}
