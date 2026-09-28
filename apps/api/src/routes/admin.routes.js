import express from 'express';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

const router = express.Router();

/** @route GET /admin/dashboard (organization administrators) */
router.get('/dashboard', authenticateToken, requirePermission('settings.organization.manage'), (req, res) => {
  res.json({
    message: 'Admin access granted'
  });
});

export default router;
