import express from 'express';
const router = express.Router();
import { getCurrentUser, getAllUsers, createUser, updateUser, toggleUserStatus, forgotPassword, resetPassword, verifyResetToken } from '../controllers/user.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';
import { createRateLimiter, emailKey } from '../platform/rate-limit.js';
import { env } from '../platform/env.js';

const passwordResetLimiter = createRateLimiter({
  name: 'password-reset',
  max: env.AUTH_RATE_LIMIT_MAX,
  windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
  key: emailKey
});

/** @route GET /users/me */
router.get('/me', authenticateToken, getCurrentUser);

/** @route GET /users (members of the active organization) */
router.get('/', authenticateToken, requirePermission('settings.users.read'), getAllUsers);

/** @route POST /users (add a member) */
router.post('/', authenticateToken, requirePermission('settings.users.manage'), createUser);

/** @route PUT /users/:id */
router.put('/:id', authenticateToken, requirePermission('settings.users.manage'), updateUser);

/** @route PATCH /users/:id/status (membership active ⇄ suspended) */
router.patch('/:id/status', authenticateToken, requirePermission('settings.users.manage'), toggleUserStatus);

// Password reset endpoints (public, rate limited per IP + email)
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);
router.post('/verify-reset-token', passwordResetLimiter, verifyResetToken);

/**
 * SMTP diagnostics. Previously public and leaking error details; now limited
 * to organization administrators and returning only a boolean outcome.
 * @route   POST /users/verify-email
 */
router.post('/verify-email', authenticateToken, requirePermission('settings.organization.manage'), async (req, res) => {
  const emailService = (await import('../services/email.service.js')).default;
  const isValid = await emailService.verifyEmailConfig();
  res.status(isValid ? 200 : 503).json({
    success: isValid,
    message: isValid ? 'Email configuration is valid' : 'Email configuration is invalid'
  });
});

/**
 * Send a test email (defaults to the administrator's own address).
 * @route   POST /users/test-email
 */
router.post('/test-email', authenticateToken, requirePermission('settings.organization.manage'), async (req, res) => {
  const email = req.body?.email || req.auth.email;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  const emailService = (await import('../services/email.service.js')).default;
  const emailSent = await emailService.sendTestEmail(email);
  res.status(emailSent ? 200 : 503).json({
    success: emailSent,
    message: emailSent ? 'Test email sent successfully' : 'Failed to send test email'
  });
});

export default router;
