import express from 'express';
const router = express.Router();
import { getSalesLocations, createSalesLocation, updateSalesLocation, deleteSalesLocation, updateSalesExecutiveLocation, getSalesExecutivesLocations } from '../controllers/salesLocation.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { checkRoles, isAdmin, isSales } from '../middleware/roleCheck.js';

/**
 * @route   GET /sales-locations
 * @desc    Get all sales locations
 * @access  Private (Admin and Manager only)
 */
router.get('/', authenticateToken, checkRoles([1, 2]), getSalesLocations);

/**
 * @route   POST /sales-locations
 * @desc    Create a new sales location
 * @access  Private (Admin only)
 */
router.post('/', authenticateToken, isAdmin, createSalesLocation);

/**
 * @route   PUT /sales-locations/:id
 * @desc    Update a sales location
 * @access  Private (Admin only)
 */
router.put('/:id', authenticateToken, isAdmin, updateSalesLocation);

/**
 * @route   DELETE /sales-locations/:id
 * @desc    Delete a sales location
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticateToken, isAdmin, deleteSalesLocation);

/**
 * @route   POST /sales-locations/update-location
 * @desc    Update the current location of a sales executive
 * @access  Private (Sales only)
 */
router.post('/update-location', authenticateToken, isSales, updateSalesExecutiveLocation);

/**
 * @route   GET /sales-locations/executives
 * @desc    Get current locations of all sales executives
 * @access  Private (Admin and Manager only)
 */
router.get('/executives', authenticateToken, checkRoles([1, 2]), getSalesExecutivesLocations);

export default router;
