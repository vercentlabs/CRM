import express from 'express';
import { getSettings, updateSettings } from '../controllers/settings.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

const router = express.Router();

// Organization settings (tenant-scoped): authenticated → member → settings.organization.manage
router.use(authenticateToken);
router.use(requirePermission('settings.organization.manage'));

/** @route GET /settings */
router.get('/', getSettings);

/** @route PATCH /settings */
router.patch('/', updateSettings);

export default router;
