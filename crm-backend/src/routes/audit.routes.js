import express from 'express';
const router = express.Router();
import authenticateToken from '../middleware/auth.middleware.js';
import { checkRoles } from '../middleware/roleCheck.js';
import { getAuditLogs } from '../controllers/audit.controller.js';

/**
 * @route   GET /
 * @desc    Get audit logs with pagination (admin only)
 * @access  Private (Admin only)
 */
router.get('/', authenticateToken, checkRoles([1]), getAuditLogs);

export default router;
