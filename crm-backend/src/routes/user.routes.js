import express from 'express';
const router = express.Router();
import { getCurrentUser, getAllUsers, createUser, updateUser, toggleUserStatus, forgotPassword, resetPassword, verifyResetToken } from '../controllers/user.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';
import { checkRoles } from '../middleware/roleCheck.js';

/**
 * @route   GET /users/me
 * @desc    Get the current user's profile
 * @access  Private
 */
router.get('/me', authenticateToken, getCurrentUser);

/**
 * @route   GET /users
 * @desc    Get all users
 * @access  Private (Admin and Manager only)
 */
router.get('/', authenticateToken, checkRoles([1, 2]), getAllUsers);

/**
 * @route   POST /users
 * @desc    Create a new user
 * @access  Private (Admin only)
 */
router.post('/', authenticateToken, checkRoles([1]), createUser);

/**
 * @route   PUT /users/:id
 * @desc    Update a user
 * @access  Private (Admin only)
 */
router.put('/:id', authenticateToken, checkRoles([1]), updateUser);

/**
 * @route   PATCH /users/:id/status
 * @desc    Toggle user active/inactive status
 * @access  Private (Admin only)
 */
router.patch('/:id/status', authenticateToken, checkRoles([1]), toggleUserStatus);

// Password reset endpoints (public)
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-reset-token', verifyResetToken);

// Email verification endpoint (public for testing)
router.post('/verify-email', async (req, res) => {
  try {
    const emailService = (await import('../services/email.service.js')).default;
    const isValid = await emailService.verifyEmailConfig();
    
    if (isValid) {
      return res.status(200).json({
        success: true,
        message: 'Email configuration is valid'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Email configuration is invalid'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   POST /users/test-email
 * @desc    Send a test email
 * @access  Private (Admin only)
 */
router.post('/test-email', authenticateToken, checkRoles([1]), async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Import email service
    const emailService = (await import('../services/email.service.js')).default;

    // Send test email
    const emailSent = await emailService.sendTestEmail(email);

    if (emailSent) {
      return res.status(200).json({
        success: true,
        message: 'Test email sent successfully'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to send test email'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

export default router;
