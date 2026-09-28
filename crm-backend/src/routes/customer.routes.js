import express from 'express';
const router = express.Router();
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from '../controllers/customer.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { checkRoles } from '../middleware/roleCheck.js';

/**
 * @route   GET /customers
 * @desc    Get all customers
 * @access  Private (Admin, Manager, and Sales)
 */
router.get('/', authenticateToken, checkRoles([1, 2, 3]), getCustomers);

/**
 * @route   POST /customers
 * @desc    Create a new customer
 * @access  Private (Admin, Manager, and Sales)
 */
router.post('/', authenticateToken, checkRoles([1, 2, 3]), createCustomer);

/**
 * @route   PUT /customers/:id
 * @desc    Update a customer
 * @access  Private (Admin, Manager, and Sales)
 */
router.put('/:id', authenticateToken, checkRoles([1, 2, 3]), updateCustomer);

/**
 * @route   DELETE /customers/:id
 * @desc    Delete a customer
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticateToken, checkRoles([1]), deleteCustomer);

export default router;
