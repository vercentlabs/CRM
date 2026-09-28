import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import crypto from 'crypto';

/**
 * Get current user
 * @route   GET /users/me
 * @desc    Get the current user's profile
 * @access  Private
 */
const getCurrentUser = async (req, res) => {
  try {
    // Get user ID from JWT token
    const userId = req.user.userId;

    // Get user from database
    const query = `
      SELECT id, full_name, email, username, role_id, is_active
      FROM users
      WHERE id = $1
    `;

    pool.query(query, [userId], (error, results) => {
      if (error) {
        return res.status(500).json({
          success: false,
          message: 'Error retrieving user',
          error: error.message
        });
      }

      if (results.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const user = results.rows[0];
      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          username: user.username,
          roleId: user.role_id,
          is_active: user.is_active
        }
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get all users
 * @route   GET /users
 * @desc    Get all users (admin and managers only)
 * @access  Private (Admin and Manager only)
 */
const getAllUsers = async (req, res) => {
  try {
    // Get role of current user from JWT token
    const currentUserRoleId = req.user.roleId;
    
    // Check if current user is an admin or manager
    if (currentUserRoleId !== 1 && currentUserRoleId !== 2) { // 1=admin, 2=manager, 3=sales
      return res.status(403).json({
        success: false,
        message: 'Only admins and managers can view all users'
      });
    }
    
    // Get all users
    const query = `
      SELECT id, full_name, email, username, role_id, is_active
      FROM users
      ORDER BY created_at DESC
    `;
    
    pool.query(query, (error, results) => {
      if (error) {
        return res.status(500).json({
          success: false,
          message: 'Error retrieving users',
          error: error.message
        });
      }
      
      res.status(200).json({
        users: results.rows
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Create a new user
 * @route   POST /users
 * @desc    Create a new user with provided information
 * @access  Private (Admin only)
 */
const createUser = async (req, res) => {
  try {
    // Extract user data from request body
    const { full_name, email, password, roleId } = req.body;

    // Validate required fields
    if (!full_name || !email || !password || !roleId) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: full_name, email, password, roleId'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Hash the password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate username from email
    const username = email.split('@')[0];

    // Insert the new user into the database
    const query = `
      INSERT INTO users (username, full_name, email, password_hash, role_id, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING id
    `;

    pool.query(query, [username, full_name, email, hashedPassword, roleId], (error, results) => {
      if (error) {
        // Check for duplicate email error
        if (error.code === '23505') {
          return res.status(409).json({
            success: false,
            message: 'Email already exists'
          });
        }
        return res.status(500).json({
          success: false,
          message: 'Error creating user',
          error: error.message
        });
      }

      // Return the created user with all necessary properties
      res.status(201).json({
        message: 'User created successfully',
        user: {
          id: results.rows[0].id,
          username: username,
          full_name: full_name,
          email: email,
          role_id: roleId,
          is_active: true
        }
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Request password reset
 * @route   POST /users/forgot-password
 * @desc    Generate a password reset token for a user and send email
 * @access  Public
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Check if user exists
    const userQuery = 'SELECT id FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      // Don't reveal if user exists or not for security
      return res.status(200).json({
        success: true,
        message: 'If a user with that email exists, a password reset link has been sent'
      });
    }

    // Generate a secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token expiry time (1 hour from now)
    const expiryTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store the hashed token and expiry in the password_resets table
    const insertQuery = 'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)';
    await pool.query(insertQuery, [userResult.rows[0].id, hashedToken, expiryTime]);

    // Send password reset email
    try {
      console.log('Attempting to send password reset email to:', email);
      // Import email service
      const emailService = (await import('../services/email.service.js')).default;

      // Get the frontend URL from environment or use default
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      console.log('Using frontend URL:', frontendUrl);

      // Send the password reset email
      const emailSent = await emailService.sendPasswordResetEmail(email, resetToken, frontendUrl);

      if (!emailSent) {
        console.error('Failed to send password reset email');
        // Still return success to avoid revealing user existence
        return res.status(200).json({
          success: true,
          message: 'If a user with that email exists, a password reset link has been sent'
        });
      }
    } catch (emailError) {
      console.error('Error sending password reset email:', emailError);
      // Still return success to avoid revealing user existence
      return res.status(200).json({
        success: true,
        message: 'If a user with that email exists, a password reset link has been sent'
      });
    }

    // Return success message
    res.status(200).json({
      success: true,
      message: 'If a user with that email exists, a password reset link has been sent'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Reset password with token
 * @route   POST /users/reset-password
 * @desc    Reset user password using a valid token
 * @access  Public
 */
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Validate input
    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    // Validate password length (minimum 8 characters)
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Validate password complexity (at least one letter and one number)
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least one letter and one number'
      });
    }

    // Hash the provided token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token that hasn't expired
    const tokenQuery = 'SELECT user_id FROM password_resets WHERE token_hash = $1 AND expires_at > NOW() AND used = false';
    const tokenResult = await pool.query(tokenQuery, [hashedToken]);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    const userId = tokenResult.rows[0].user_id;

    // Hash the new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    const updateQuery = 'UPDATE users SET password_hash = $1 WHERE id = $2';
    await pool.query(updateQuery, [hashedPassword, userId]);

    // Mark token as used
    const markTokenQuery = 'UPDATE password_resets SET used = true WHERE token_hash = $1';
    await pool.query(markTokenQuery, [hashedToken]);

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Update a user
 * @route   PUT /users/:id
 * @desc    Update user information
 * @access  Private (Admin only)
 */
const updateUser = async (req, res) => {
  try {
    // Get user ID from params
    const { id } = req.params;
    
    // Extract user data from request body
    const { full_name, email, username, role_id } = req.body;
    
    // Get role of current user from JWT token
    const currentUserRoleId = req.user.roleId;
    
    // Check if current user is an admin
    if (currentUserRoleId !== 1) { // 1=admin
      return res.status(403).json({
        success: false,
        message: 'Only admins can update users'
      });
    }
    
    // Validate required fields
    if (!full_name || !email || !username || !role_id) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: full_name, email, username, role_id'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }
    
    // Update user in database
    const query = `
      UPDATE users 
      SET full_name = $1, email = $2, username = $3, role_id = $4 
      WHERE id = $5
      RETURNING id, full_name, email, username, role_id, is_active
    `;
    
    pool.query(query, [full_name, email, username, role_id, id], (error, results) => {
      if (error) {
        // Check for duplicate email error
        if (error.code === '23505') {
          return res.status(409).json({
            success: false,
            message: 'Email already exists'
          });
        }
        return res.status(500).json({
          success: false,
          message: 'Error updating user',
          error: error.message
        });
      }
      
      if (results.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Return updated user
      res.status(200).json({
        success: true,
        message: 'User updated successfully',
        user: results.rows[0]
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Verify reset token
 * @route   POST /users/verify-reset-token
 * @desc    Check if a reset token is valid
 * @access  Public
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

    // Hash the provided token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token that hasn't expired
    const tokenQuery = 'SELECT user_id FROM password_resets WHERE token_hash = $1 AND expires_at > NOW() AND used = false';
    const tokenResult = await pool.query(tokenQuery, [hashedToken]);

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
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Toggle user status
 * @route   PATCH /users/:id/status
 * @desc    Toggle user active/inactive status
 * @access  Private (Admin only)
 */
const toggleUserStatus = async (req, res) => {
  try {
    // Get user ID from params
    const { id } = req.params;

    // Get role of current user from JWT token
    const currentUserRoleId = req.user.roleId;

    // Check if current user is an admin
    if (currentUserRoleId !== 1) { // 1=admin
      return res.status(403).json({
        success: false,
        message: 'Only admins can update user status'
      });
    }

    // Get current user status
    const getCurrentStatusQuery = 'SELECT is_active FROM users WHERE id = $1';
    const currentStatusResult = await pool.query(getCurrentStatusQuery, [id]);

    if (currentStatusResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Toggle status
    const newStatus = !currentStatusResult.rows[0].is_active;

    // Update user status in database
    const updateQuery = `
      UPDATE users
      SET is_active = $1
      WHERE id = $2
      RETURNING id, full_name, email, username, role_id, is_active
    `;

    const result = await pool.query(updateQuery, [newStatus, id]);

    // Return updated user
    res.status(200).json({
      success: true,
      message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
      user: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
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
