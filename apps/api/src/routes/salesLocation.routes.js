import express from 'express';
const router = express.Router();
import { getSalesLocations, createSalesLocation, updateSalesLocation, deleteSalesLocation, updateSalesExecutiveLocation, getSalesExecutivesLocations } from '../controllers/salesLocation.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

router.use(authenticateToken);

/** @route GET /sales-locations */
router.get('/', requirePermission('crm.locations.read'), getSalesLocations);

/** @route POST /sales-locations */
router.post('/', requirePermission('crm.locations.manage'), createSalesLocation);

/** @route PUT /sales-locations/:id */
router.put('/:id', requirePermission('crm.locations.manage'), updateSalesLocation);

/** @route DELETE /sales-locations/:id */
router.delete('/:id', requirePermission('crm.locations.manage'), deleteSalesLocation);

/** @route POST /sales-locations/update-location */
router.post('/update-location', requirePermission('crm.locations.checkin'), updateSalesExecutiveLocation);

/** @route GET /sales-locations/executives */
router.get('/executives', requirePermission('crm.locations.read'), getSalesExecutivesLocations);

export default router;
