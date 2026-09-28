import {
  assignmentSchema,
  createOpportunitySchema,
  updateOpportunitySchema,
} from '@crm/validation';
import { Router } from 'express';
import { legacyId, legacyPage, legacyPagination, legacyRoute } from '../../platform/http/legacy.js';
import * as service from './opportunities.service.js';

/** DEPRECATED `/opportunities/*` adapters → opportunities.service. */
export function legacyOpportunitiesRouter(): Router {
  const router = Router();

  router.post(
    '/',
    ...legacyRoute({
      permission: 'crm.opportunities.create',
      body: createOpportunitySchema,
      handle: async ({ actor, body, res }) => {
        const opportunity = await service.createOpportunity(actor, body);
        res.status(201).json({
          message: 'Opportunity created successfully',
          opportunity: {
            id: opportunity.id,
            created_by: opportunity.created_by,
            assigned_to: opportunity.assigned_to,
          },
        });
      },
    }),
  );

  router.get(
    '/',
    ...legacyRoute({
      permission: 'crm.opportunities.read',
      handle: async ({ actor, req, res }) => {
        const { page, limit } = legacyPage(req.query);
        const { items, total } = await service.listOpportunities(actor, {
          orderBy: 'o.created_at DESC',
          page,
          limit,
        });
        res
          .status(200)
          .json({ opportunities: items, pagination: legacyPagination(page, limit, total) });
      },
    }),
  );

  router.patch(
    '/:opportunityId/assign',
    ...legacyRoute({
      permission: 'crm.opportunities.assign',
      scope: 'organization',
      body: assignmentSchema,
      handle: async ({ actor, body, req, res }) => {
        const opportunityId = legacyId(req.params.opportunityId, 'Opportunity not found');
        await service.assignOpportunity(actor, opportunityId, body);
        res.status(200).json({
          message: 'Opportunity assigned successfully',
          opportunityId,
          assignedTo: body.assigned_to,
        });
      },
    }),
  );

  router.put(
    '/:id',
    ...legacyRoute({
      permission: 'crm.opportunities.update',
      body: updateOpportunitySchema,
      handle: async ({ actor, body, req, res }) => {
        const opportunityId = legacyId(req.params.id, 'Opportunity not found');
        const { updatedFields } = await service.updateOpportunity(actor, opportunityId, body);
        res
          .status(200)
          .json({ message: 'Opportunity updated successfully', opportunityId, updatedFields });
      },
    }),
  );

  return router;
}
