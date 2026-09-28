/**
 * JWT Token Helper Functions
 * Safely handles JWT tokens in Next.js client/server environment
 */

import api from './api';

// Save token to localStorage
export const saveToken = (token) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('token', token);
  }
};

// Get token from localStorage
export const getToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
};

// Remove token from localStorage
export const removeToken = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
  }
};

// Decode JWT token to extract payload
export const decodeToken = (token) => {
  if (!token) return null;

  try {
    // Split token and get payload part
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    // Decode base64 payload
    const payload = parts[1];
    const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));

    // Parse JSON
    const parsedPayload = JSON.parse(decodedPayload);

    // Check if token is expired
    if (parsedPayload.exp && parsedPayload.exp * 1000 < Date.now()) {
      // Token is expired - return null without logging an error
      // This is expected behavior and the AuthProvider will handle it by removing the token
      return null;
    }

    return parsedPayload;
  } catch (error) {
    // Only log errors that aren't related to token expiration
    if (error.message !== 'Token expired') {
      console.error('Error decoding token:', error.message);
    }
    return null;
  }
};

// Get current user data from token
export const getCurrentUser = () => {
  const token = getToken();
  if (!token) return null;

  const decoded = decodeToken(token);
  if (!decoded) return null;

  return {
    userId: decoded.userId || decoded.sub,
    roleId: decoded.roleId,
    email: decoded.email,
    name: decoded.name,
    // Add any other fields from your JWT payload
  };
};

// Check if user has specific role
export const hasRole = (requiredRoleId) => {
  const user = getCurrentUser();
  return user && user.roleId === requiredRoleId;
};

// Check if user is admin
export const isAdmin = () => {
  return hasRole(1); // ROLE_ADMIN = 1
};

// Check if user is manager or higher
export const isManagerOrHigher = () => {
  const user = getCurrentUser();
  return user && (user.roleId === 1 || user.roleId === 2); // ADMIN or MANAGER
};

// Login function
export const login = async (email, password) => {
  try {
    const response = await api.post('/auth/login', {
      email,
      password
    });

    // Extract data from response based on backend structure
    const { data } = response.data;
    const { token, user } = data || {};

    // Save token to localStorage
    if (token) {
      saveToken(token);
    }

    return {
      success: true,
      user: user || {},
      token: token
    };
  } catch (error) {
    // Handle login error
    let errorMessage = 'Login failed. Please try again.';

    if (error.response && error.response.data) {
      errorMessage = error.response.data.message || errorMessage;
    }

    return {
      success: false,
      error: errorMessage
    };
  }
};
