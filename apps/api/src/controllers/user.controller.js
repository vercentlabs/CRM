import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { passwordSchema } from '@crm/validation';
import pool from '../config/db.js';
import { revokeUserSessions } from '../platform/auth/repository.js';
import {
  addMember,
  changeMemberRole,
  getMember,
  isExclusiveMember,
  listMembers,
  resolveAssignableRole,
  setMemberStatus
} from '../platform/organizations/members.js';
import { parseId, serverError, tenantOf } from '../platform/tenancy.js';
import { recordAuditEvent } from '../platform/audit.js';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_RESET_RESPONSE = {
  success: true,
  message: 'If a user with that email exists, a password reset link has been sent'
};

/** Maps AppError-style failures thrown by the membership service to legacy JSON. */
const handleMemberError = (res, error, fallback) => {
  if (error && typeof error.status === 'number' && error.status < 500 && error.code) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  return serverError(res, fallback, error);
};

/**
 * @route   GET /users/me
 * @access  Authenticated member
 */
const getCurrentUser = async (req, res) => {
  try {
    const auth = req.auth;
    const result = await pool.query('SELECT username FROM users WHERE id = $1', [auth.userId]);
    res.status(200).json({
      success: true,
      user: {
        id: auth.userId,
        full_name: auth.name,
        email: auth.email,
        username: result.rows[0]?.username ?? null,
        roleId: auth.legacyRoleId,
        role: { key: auth.roleKey, name: auth.roleName },
        is_active: true,
        organization: { id: auth.organizationPublicId, name: auth.organizationName, slug: auth.organizationSlug },
        permissions: Object.fromEntries(auth.permissions)
      }
    });
  } catch (error) {
    return serverError(res, 'Error retrieving user', error);
  }
};

/**
 * Members of the active organization (never users of other organizations)
 * @route   GET /users
 * @access  settings.users.read
 */
const getAllUsers = async (req, res) => {
  try {
    const { organizationId } = tenantOf(req);
    res.status(200).json({ users: await listMembers(organizationId) });
  } catch (error) {
    return serverError(res, 'Error retrieving users', error);
  }
};

/**
 * Add a member to the active organization
 * @route   POST /users
 * @access  settings.users.manage (cannot grant a role above the actor's own privileges)
 */
const createUser = async (req, res) => {
  try {
    const { full_name, email, password, roleId, roleKey } = req.body;

    if (!full_name || !email || !password || (!roleId && !roleKey)) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: full_name, email, password, roleId'
      });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    const passwordCheck = passwordSchema.safeParse(password);
    if (!passwordCheck.success) {
      return res.status(400).json({ success: false, message: passwordCheck.error.issues[0].message });
    }

    const role = await resolveAssignableRole(req.auth.organizationId, { roleKey, legacyRoleId: roleId });
    if (!role) {
      return res.status(400).json({ success: false, message: 'Unknown role' });
    }

    const { member, created } = await addMember(req.auth, {
      email: email.trim(),
      fullName: full_name,
      password,
      role
    });

    res.status(201).json({
      message: created ? 'User created successfully' : 'User invited to the organization',
      user: member
    });
  } catch (error) {
    return handleMemberError(res, error, 'Error creating user');
  }
};

/**
 * Update a member. Role changes apply to the membership in this organization.
 * Identity fields (name/email/username) can only be changed for users who
 * belong to no other organization, or by the user themselves.
 * @route   PUT /users/:id
 * @access  settings.users.manage
 */
const updateUser = async (req, res) => {
  try {
    const { organizationId, userId: actorId } = tenantOf(req);
    const targetId = parseId(req.params.id);
    const { full_name, email, username, role_id, roleKey } = req.body;

    if (!full_name || !email || !username || (!role_id && !roleKey)) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: full_name, email, username, role_id'
      });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    const current = targetId === null ? null : await getMember(organizationId, targetId);
    if (!current) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const role = await resolveAssignableRole(organizationId, { roleKey, legacyRoleId: role_id });
    if (!role) {
      return res.status(400).json({ success: false, message: 'Unknown role' });
    }
    if (role.key !== current.role_key) {
      await changeMemberRole(req.auth, targetId, role);
    }

    const identityChanged =
      full_name !== current.full_name || email !== current.email || username !== current.username;
    if (identityChanged) {
      if (targetId !== actorId && !(await isExclusiveMember(organizationId, targetId))) {
        return res.status(403).json({
          success: false,
          message: 'This user belongs to other organizations; only they can change their profile'
        });
      }
      await pool.query('UPDATE users SET full_name = $1, email = $2, username = $3 WHERE id = $4', [
        full_name,
        email,
        username,
        targetId
      ]);
      await recordAuditEvent({
        action: 'USER_PROFILE_UPDATED',
        tableName: 'users',
        recordId: targetId,
        oldValues: { full_name: current.full_name, email: current.email, username: current.username },
        newValues: { full_name, email, username }
      });
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: await getMember(organizationId, targetId)
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Email or username already exists' });
    }
    return handleMemberError(res, error, 'Error updating user');
  }
};

/**
 * Toggle the member's status in this organization (active ⇄ suspended).
 * Suspending revokes the member's sessions for this organization.
 * @route   PATCH /users/:id/status
 * @access  settings.users.manage
 */
const toggleUserStatus = async (req, res) => {
  try {
    const { organizationId } = tenantOf(req);
    const targetId = parseId(req.params.id);
    const current = targetId === null ? null : await getMember(organizationId, targetId);
    if (!current) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (current.membership_status === 'invited') {
      return res.status(409).json({ success: false, message: 'The invitation has not been accepted yet' });
    }

    const activate = current.membership_status !== 'active';
    await setMemberStatus(req.auth, targetId, activate ? 'active' : 'suspended');

    res.status(200).json({
      success: true,
      message: `User ${activate ? 'activated' : 'deactivated'} successfully`,
      user: await getMember(organizationId, targetId)
    });
  } catch (error) {
    return handleMemberError(res, error, 'Error updating user status');
  }
};

/**
 * @route   POST /users/forgot-password (public, rate limited)
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    const userResult = await pool.query('SELECT id, email FROM users WHERE lower(email) = lower($1)', [email]);
    if (userResult.rows.length === 0) {
      // Don't reveal whether the user exists
      return res.status(200).json(GENERIC_RESET_RESPONSE);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiryTime = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
      userResult.rows[0].id,
      hashedToken,
      expiryTime
    ]);

    try {
      const emailService = (await import('../services/email.service.js')).default;
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const emailSent = await emailService.sendPasswordResetEmail(userResult.rows[0].email, resetToken, frontendUrl);
      if (!emailSent) console.error('Failed to send password reset email');
    } catch (emailError) {
      console.error('Error sending password reset email:', emailError instanceof Error ? emailError.message : emailError);
    }

    res.status(200).json(GENERIC_RESET_RESPONSE);
  } catch (error) {
    return serverError(res, 'Server error', error);
  }
};

/**
 * Reset password with token. Revokes every existing session of the user.
 * @route   POST /users/reset-password (public, rate limited)
 */
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least one letter and one number'
      });
    }

    const hashedToken = crypto.createHash('sha256').update(String(token)).digest('hex');
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const client = await pool.connect();
    let userId;
    try {
      await client.query('BEGIN');
      const tokenResult = await client.query(
        `UPDATE password_resets SET used = true
         WHERE token_hash = $1 AND expires_at > NOW() AND used = false
         RETURNING user_id`,
        [hashedToken]
      );
      if (tokenResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token'
        });
      }
      userId = tokenResult.rows[0].user_id;
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);
      await revokeUserSessions(userId, 'password_reset', undefined, client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    await recordAuditEvent({
      organizationId: null,
      userId,
      action: 'PASSWORD_RESET',
      tableName: 'users',
      recordId: userId
    });

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    return serverError(res, 'Server error', error);
  }
};

/**
 * @route   POST /users/verify-reset-token (public, rate limited)
 */
const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    const hashedToken = crypto.createHash('sha256').update(String(token)).digest('hex');
    const tokenResult = await pool.query(
      'SELECT 1 FROM password_resets WHERE token_hash = $1 AND expires_at > NOW() AND used = false',
      [hashedToken]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Token is valid'
    });
  } catch (error) {
    return serverError(res, 'Server error', error);
  }
};

export {
  getCurrentUser,
  getAllUsers,
  createUser,
  updateUser,
  toggleUserStatus,
  forgotPassword,
  resetPassword,
  verifyResetToken
};
