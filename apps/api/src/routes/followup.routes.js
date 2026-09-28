import express from 'express';
const router = express.Router();
import { createFollowup } from '../controllers/lead.controller.js';
import { getFollowups, getOverdueFollowups, completeFollowup, markFollowupOverdue } from '../controllers/followup.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

router.use(authenticateToken);

/** @route POST /followups (expects /leads/:leadId/followups; kept for compatibility) */
router.post('/', requirePermission('crm.followups.create'), createFollowup);

/** @route GET /followups */
router.get('/', requirePermission('crm.followups.read'), getFollowups);

/** @route GET /followups/overdue */
router.get('/overdue', requirePermission('crm.followups.read'), getOverdueFollowups);

/** @route PATCH /followups/:id/complete */
router.patch('/:id/complete', requirePermission('crm.followups.update'), completeFollowup);

/** @route PATCH /followups/:id/overdue */
router.patch('/:id/overdue', requirePermission('crm.followups.update'), markFollowupOverdue);

export default router;
