import express from 'express';
const router = express.Router();
import { getGoldRate, refreshGoldRate } from '../controllers/gold.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { checkRoles } from '../middleware/roleCheck.js';

/**
 * @route   GET /gold/gold-rate
 * @desc    Get current gold rates for 22k and 24k gold in various weights
 * @access  Private (all roles)
 */
router.get('/gold-rate', authenticateToken, getGoldRate);

/**
 * @route   POST /gold/refresh
 * @desc    Force refresh gold rates and update cache
 * @access  Admin only
 */
router.post('/gold/refresh', authenticateToken, checkRoles([1]), refreshGoldRate);

export default router;