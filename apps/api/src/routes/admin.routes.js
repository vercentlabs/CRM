import express from 'express';
const router = express.Router();
import authenticateToken from '../middleware/auth.middleware.js';
import { checkRoles } from '../middleware/roleCheck.js';

/**
 * @route   GET /admin/dashboard
 * @desc    Admin dashboard route that requires authentication and admin role
 * @access  Private (Admin only)
 */
router.get('/dashboard', authenticateToken, checkRoles([1]), (req, res) => {
  res.json({
    message: 'Admin access granted'
  });
});

export default router;
