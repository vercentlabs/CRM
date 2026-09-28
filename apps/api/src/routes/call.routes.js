import express from 'express';
const router = express.Router();
import { initiateCall, endCall, getCallLogs } from '../controllers/call.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

router.use(authenticateToken);

/** @route POST /calls/initiate */
router.post('/initiate', requirePermission('crm.calls.create'), initiateCall);

/** @route PUT /calls/:id/end */
router.put('/:id/end', requirePermission('crm.calls.update'), endCall);

/** @route GET /calls */
router.get('/', requirePermission('crm.calls.read'), getCallLogs);

export default router;
