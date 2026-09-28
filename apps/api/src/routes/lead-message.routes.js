
import express from 'express';
const router = express.Router();
import { sendLeadMessage, getLeadMessages, updateLeadMessageStatus, sendBulkLeadMessages } from '../controllers/lead-message.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

/**
 * @route   POST /api/lead-messages/send
 * @desc    Send a message to a lead
 * @access  Private
 */
router.post('/send', authenticateToken, sendLeadMessage);

/**
 * @route   GET /api/lead-messages
 * @desc    Get lead messages based on user role
 * @access  Private
 */
router.get('/', authenticateToken, getLeadMessages);

/**
 * @route   PUT /api/lead-messages/:id/status
 * @desc    Update lead message delivery status
 * @access  Private
 * Previously unauthenticated, which let anyone rewrite any message's status.
 * No external webhook calls this route; the web client already sends a token.
 */
router.put('/:id/status', authenticateToken, updateLeadMessageStatus);

/**
 * @route   POST /api/lead-messages/bulk
 * @desc    Send bulk messages to multiple leads
 * @access  Private
 */
router.post('/bulk', authenticateToken, sendBulkLeadMessages);

export default router;
