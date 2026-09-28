import express from 'express';
const router = express.Router();
import { createOpportunity, getOpportunities, assignOpportunity, updateOpportunity } from '../controllers/opportunity.controller.js';
import authenticateToken, { requirePermission, requireScope } from '../middleware/auth.middleware.js';

router.use(authenticateToken);

/** @route POST /opportunities */
router.post('/', requirePermission('crm.opportunities.create'), createOpportunity);

/** @route GET /opportunities */
router.get('/', requirePermission('crm.opportunities.read'), getOpportunities);

/** @route PATCH /opportunities/:opportunityId/assign */
router.patch('/:opportunityId/assign', requireScope('crm.opportunities.assign', 'organization'), assignOpportunity);

/** @route PUT /opportunities/:id */
router.put('/:id', requirePermission('crm.opportunities.update'), updateOpportunity);

export default router;
