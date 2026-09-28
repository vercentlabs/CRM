import express from 'express';
const router = express.Router();
import { createLead, getLeads, getLeadById, assignLead, updateLead, createFollowup } from '../controllers/lead.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { isAdminOrManager, isSales } from '../middleware/roleCheck.js';

/**
 * @route   POST /leads
 * @desc    Create a new lead
 * @access  Private
 */
router.post('/', authenticateToken, createLead);

/**
 * @route   GET /leads
 * @desc    Get leads based on user role
 * @access  Private
 */
router.get('/', authenticateToken, getLeads);

/**
 * @route   GET /leads/:id
 * @desc    Get a single lead by ID
 * @access  Private
 */
router.get('/:id', authenticateToken, getLeadById);

/**
 * @route   PATCH /leads/:leadId/assign
 * @desc    Assign a lead to a sales user
 * @access  Private (Admin and Manager only)
 */
router.patch('/:leadId/assign', authenticateToken, isAdminOrManager, assignLead);

/**
 * @route   PUT /leads/:id
 * @desc    Update a lead
 * @access  Private
 */
router.put('/:id', authenticateToken, updateLead);

/**
 * @route   POST /leads/:leadId/followups
 * @desc    Create a followup for a lead
 * @access  Private (Sales only)
 */
router.post('/:leadId/followups', authenticateToken, isSales, createFollowup);

export default router;
