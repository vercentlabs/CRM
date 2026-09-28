import express from 'express';
const router = express.Router();
import { createFollowup } from '../controllers/lead.controller.js';
import { getFollowups, getOverdueFollowups, completeFollowup, markFollowupOverdue } from '../controllers/followup.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

/**
 * @route   POST /followups
 * @desc    Create a followup for a lead
 * @access  Private (role check inside controller)
 */
router.post('/', authenticateToken, createFollowup);

/**
 * @route   GET /followups
 * @desc    Get followups based on user role
 * @access  Private
 */
router.get('/', authenticateToken, getFollowups);

/**
 * @route   GET /followups/overdue
 * @desc    Get overdue followups based on user role
 * @access  Private
 */
router.get('/overdue', authenticateToken, getOverdueFollowups);

/**
 * @route   PATCH /followups/:id/complete
 * @desc    Mark a followup as completed
 * @access  Private (Sales only)
 */
router.patch('/:id/complete', authenticateToken, completeFollowup);

/**
 * @route   PATCH /followups/:id/overdue
 * @desc    Mark a followup as overdue
 * @access  Private (Sales only)
 */
router.patch('/:id/overdue', authenticateToken, markFollowupOverdue);

export default router;
