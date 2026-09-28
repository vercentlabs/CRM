import express from 'express';
const router = express.Router();
import { sendMessage, getMessages, updateMessageStatus, sendBulkMessage } from '../controllers/message.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

/**
 * @route   POST /messages/send
 * @desc    Send a message to a lead
 * @access  Private
 */
router.post('/send', authenticateToken, sendMessage);

/**
 * @route   GET /messages
 * @desc    Get messages based on user role
 * @access  Private
 */
router.get('/', authenticateToken, getMessages);

/**
 * @route   PUT /messages/:id/status
 * @desc    Update message delivery status
 * @access  Private
 */
router.put('/:id/status', authenticateToken, updateMessageStatus);

/**
 * @route   POST /messages/bulk
 * @desc    Send bulk messages to multiple leads
 * @access  Private
 */
router.post('/bulk', authenticateToken, sendBulkMessage);

export default router;