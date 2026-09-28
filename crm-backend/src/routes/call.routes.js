import express from 'express';
const router = express.Router();
import { initiateCall, endCall, getCallLogs } from '../controllers/call.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

/**
 * @route   POST /calls/initiate
 * @desc    Initiate a call for a lead
 * @access  Private
 */
router.post('/initiate', authenticateToken, initiateCall);

/**
 * @route   PUT /calls/:id/end
 * @desc    End a call and update its details
 * @access  Private (Sales only)
 */
router.put('/:id/end', authenticateToken, endCall);

/**
 * @route   GET /calls
 * @desc    Get call logs based on user role
 * @access  Private
 */
router.get('/', authenticateToken, getCallLogs);

export default router;
