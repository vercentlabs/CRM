import express from 'express';
const router = express.Router();
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from '../controllers/customer.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

router.use(authenticateToken);

/** @route GET /customers */
router.get('/', requirePermission('crm.customers.read'), getCustomers);

/** @route POST /customers */
router.post('/', requirePermission('crm.customers.create'), createCustomer);

/** @route PUT /customers/:id */
router.put('/:id', requirePermission('crm.customers.update'), updateCustomer);

/** @route DELETE /customers/:id */
router.delete('/:id', requirePermission('crm.customers.delete'), deleteCustomer);

export default router;
