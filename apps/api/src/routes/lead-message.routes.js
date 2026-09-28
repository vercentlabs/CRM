import express from 'express';
const router = express.Router();
import { sendLeadMessage, getLeadMessages, updateLeadMessageStatus, sendBulkLeadMessages } from '../controllers/lead-message.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

router.use(authenticateToken);

/** @route POST /api/lead-messages/send */
router.post('/send', requirePermission('crm.messages.send'), sendLeadMessage);

/** @route GET /api/lead-messages */
router.get('/', requirePermission('crm.messages.read'), getLeadMessages);

/** @route PUT /api/lead-messages/:id/status (authenticated since Phase 1; tenant + scope bound since Phase 2) */
router.put('/:id/status', requirePermission('crm.messages.update'), updateLeadMessageStatus);

/** @route POST /api/lead-messages/bulk */
router.post('/bulk', requirePermission('crm.messages.send'), sendBulkLeadMessages);

export default router;
