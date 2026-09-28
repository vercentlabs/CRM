import express from 'express';
const router = express.Router();
import { createLead, getLeads, getLeadById, assignLead, updateLead, createFollowup } from '../controllers/lead.controller.js';
import authenticateToken, { requirePermission, requireScope } from '../middleware/auth.middleware.js';

// Every route: authenticated → active membership → permission → controller.
// Controllers bound all SQL by req.auth.organizationId and apply record scope.
router.use(authenticateToken);

/** @route POST /leads */
router.post('/', requirePermission('crm.leads.create'), createLead);

/** @route GET /leads */
router.get('/', requirePermission('crm.leads.read'), getLeads);

/** @route GET /leads/:id */
router.get('/:id', requirePermission('crm.leads.read'), getLeadById);

/** @route PATCH /leads/:leadId/assign */
router.patch('/:leadId/assign', requireScope('crm.leads.assign', 'organization'), assignLead);

/** @route PUT /leads/:id */
router.put('/:id', requirePermission('crm.leads.update'), updateLead);

/** @route POST /leads/:leadId/followups */
router.post('/:leadId/followups', requirePermission('crm.followups.create'), createFollowup);

export default router;
