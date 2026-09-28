import express from 'express';
const router = express.Router();
import { getGoldRate, refreshGoldRate } from '../controllers/gold.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

// The gold rate is platform-wide market data (not tenant data); any member may read it.

/** @route GET /gold-rate */
router.get('/gold-rate', authenticateToken, getGoldRate);

/** @route POST /gold/refresh */
router.post('/gold/refresh', authenticateToken, requirePermission('settings.organization.manage'), refreshGoldRate);

export default router;
