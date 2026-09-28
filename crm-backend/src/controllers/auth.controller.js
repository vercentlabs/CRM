import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { sendSuccess, sendError, sendValidationError } from '../utils/response.js';
import { logAuditEvent } from '../utils/auditLogger.js';

// Login controller
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return sendValidationError(res, [
        { field: email ? 'password' : 'email', message: `${email ? 'Password' : 'Email'} is required` }
      ]);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendValidationError(res, [
        { field: 'email', message: 'Invalid email format' }
      ]);
    }

    // Validate password length (minimum 8 characters)
    if (password.length < 8) {
      return sendValidationError(res, [
        { field: 'password', message: 'Password must be at least 8 characters long' }
      ]);
    }

    // Validate password complexity (at least one letter and one number)
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return sendValidationError(res, [
        { field: 'password', message: 'Password must contain at least one letter and one number' }
      ]);
    }

    // Query the database for the user
    const userQuery = 'SELECT id, email, password_hash, role_id, full_name, username FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email]);

    // Check if user exists
    if (userResult.rows.length === 0) {
      return sendError(res, 'Invalid email or password', 401);
    }

    const user = userResult.rows[0];

    // Compare the provided password with the stored hash
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return sendError(res, 'Invalid email or password', 401);
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        roleId: user.role_id,
        name: user.full_name || user.username,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log successful login
    await logAuditEvent(
      user.id,
      'LOGIN_SUCCESS',
      'users',
      user.id,
      null,
      {
        email: user.email,
        roleId: user.role_id,
        timestamp: new Date().toISOString()
      },
      req.ip,
      req.get('User-Agent')
    );

    // Return the token to the client
    return sendSuccess(res, 'Login successful', {
      token,
      user: {
        id: user.id,
        email: user.email,
        roleId: user.role_id,
        name: user.full_name || user.username
      }
    });

  } catch (error) {
    console.error('Error during login:', error);
    return sendError(res, 'Internal server error', 500, error.message);
  }
};

// Logout controller
const logout = async (req, res) => {
  try {
    // For JWT tokens, logout is typically handled client-side by removing the token
    // We don't need to do anything server-side, but we'll return a success message
    return sendSuccess(res, 'Logout successful');
  } catch (error) {
    console.error('Error during logout:', error);
    return sendError(res, 'Internal server error', 500, error.message);
  }
};

export {
  login,
  logout
};
