import express from 'express';
import { getAuditLogs } from '../controllers/audit.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

const router = express.Router();

/** @route GET /audit (the organization's own audit log) */
router.get('/', authenticateToken, requirePermission('settings.audit.read'), getAuditLogs);

export default router;
