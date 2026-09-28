import express from 'express';
const router = express.Router();
import { sendMessage, getMessages, updateMessageStatus, sendBulkMessage } from '../controllers/message.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

router.use(authenticateToken);

/** @route POST /messages/send */
router.post('/send', requirePermission('crm.messages.send'), sendMessage);

/** @route GET /messages */
router.get('/', requirePermission('crm.messages.read'), getMessages);

/** @route PUT /messages/:id/status (authenticated since Phase 1; tenant + scope bound since Phase 2) */
router.put('/:id/status', requirePermission('crm.messages.update'), updateMessageStatus);

/** @route POST /messages/bulk */
router.post('/bulk', requirePermission('crm.messages.send'), sendBulkMessage);

export default router;
