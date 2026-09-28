"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { can, fetchSession, logout as endSession } from '../lib/auth';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '../lib/constants';

// Create the authentication context
const AuthContext = createContext();

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Session state for the web app. Authentication is an HttpOnly cookie session;
 * `token` is kept only as a non-secret "authenticated" marker because many
 * components gate their data fetching on it. Never send it as a header.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore the session from the cookies on app load
  useEffect(() => {
    let active = true;
    fetchSession()
      .then((sessionUser) => {
        if (active) setUser(sessionUser);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Called by the login page with the user returned by lib/auth.login()
  const login = (userData) => {
    if (!userData) {
      return { success: false, error: 'Invalid login response' };
    }
    setUser(userData);
    return { success: true };
  };

  // Logout: mark offline, revoke the server session, clear local state
  const logout = async (router) => {
    try {
      const api = (await import('@/lib/api')).default;
      await api.put('/api/chat/online-status', { isOnline: false });
    } catch (err) {
      console.error('Error updating online status on logout:', err);
    }

    await endSession();
    setUser(null);

    if (router) {
      router.push('/login');
    }
  };

  // Role checks are UI hints only; the API enforces permissions.
  const hasRole = (roleId) => {
    return Boolean(user && user.roleId === roleId);
  };

  const isAdmin = () => hasRole(ROLE_ADMIN);
  const isManager = () => hasRole(ROLE_MANAGER);
  const isSales = () => hasRole(ROLE_SALES);
  const isManagerOrHigher = () => isAdmin() || isManager();

  const value = {
    user,
    token: user ? 'cookie-session' : null,
    loading,
    login,
    logout,
    hasRole,
    hasPermission: (permission) => can(user, permission),
    isAdmin,
    isManager,
    isSales,
    isManagerOrHigher,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
