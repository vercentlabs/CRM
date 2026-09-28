import express from 'express';
import { getSettings, updateSettings } from '../controllers/settings.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import checkRole from '../middleware/role.middleware.js';

const router = express.Router();

// All settings routes require authentication and admin role
router.use(authenticateToken);
router.use(checkRole([1]));

/**
 * @route   GET /settings
 * @desc    Get all system settings
 * @access  Private (Admin only)
 */
router.get('/', getSettings);

/**
 * @route   PATCH /settings
 * @desc    Update system settings
 * @access  Private (Admin only)
 */
router.patch('/', updateSettings);

export default router;
