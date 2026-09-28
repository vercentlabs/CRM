import express from 'express';
const router = express.Router();
import { createOpportunity, getOpportunities, assignOpportunity, updateOpportunity } from '../controllers/opportunity.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { isAdminOrManager, isSales } from '../middleware/roleCheck.js';

/**
 * @route   POST /opportunities
 * @desc    Create a new opportunity
 * @access  Private
 */
router.post('/', authenticateToken, createOpportunity);

/**
 * @route   GET /opportunities
 * @desc    Get opportunities based on user role
 * @access  Private
 */
router.get('/', authenticateToken, getOpportunities);

/**
 * @route   PATCH /opportunities/:opportunityId/assign
 * @desc    Assign an opportunity to a sales user
 * @access  Private (Admin and Manager only)
 */
router.patch('/:opportunityId/assign', authenticateToken, isAdminOrManager, assignOpportunity);

/**
 * @route   PUT /opportunities/:id
 * @desc    Update an opportunity
 * @access  Private
 */
router.put('/:id', authenticateToken, updateOpportunity);

export default router;
