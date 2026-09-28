"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, saveToken, removeToken, decodeToken } from '../lib/auth';
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

// AuthProvider component to wrap the app
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state from localStorage on app load
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;
    
    const initializeAuth = async () => {
      try {
        const savedToken = getToken();

        if (savedToken) {
          const decoded = decodeToken(savedToken);

          if (decoded) {
            setToken(savedToken);

            // Try to fetch user profile from backend to get complete user data
            try {
              const api = (await import('@/lib/api')).default;
              const response = await api.get('/users/me');
              const userData = response.data.user;

              setUser({
                id: userData.id || decoded.userId || decoded.sub,
                roleId: userData.roleId || decoded.roleId,
                email: userData.email || decoded.email,
                name: userData.full_name || userData.username || decoded.name || 'Unknown User',
                // Add any other fields from your JWT payload
              });
            } catch (err) {
              // If fetching user profile fails, fall back to token data
              console.error('Error fetching user profile:', err);
              setUser({
                id: decoded.userId || decoded.sub,
                roleId: decoded.roleId,
                email: decoded.email,
                name: decoded.name || 'Unknown User',
                // Add any other fields from your JWT payload
              });
            }
          } else {
            // Token is invalid or expired
            removeToken();
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        removeToken();
      } finally {
        setLoading(false);
      }
    };

    // Small delay to ensure client-side rendering is complete
    const timer = setTimeout(initializeAuth, 100);
    return () => clearTimeout(timer);
  }, []);

  // Login function
  const login = (authToken, userData = null) => {
    try {
      // If userData is not provided, decode it from the token
      if (!userData) {
        userData = decodeToken(authToken);
        if (!userData) {
          throw new Error('Invalid token');
        }

        userData = {
          id: userData.userId || userData.sub,
          roleId: userData.roleId,
          email: userData.email,
          name: userData.name,
          // Add any other fields from your JWT payload
        };
      }

      // Save token to localStorage
      saveToken(authToken);

      // Update state
      setToken(authToken);
      setUser(userData);

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  };

  // Logout function
  const logout = async (router) => {
    try {
      // Update online status to offline before logging out
      const api = (await import('@/lib/api')).default;
      await api.put('/api/chat/online-status', { isOnline: false });
    } catch (err) {
      console.error('Error updating online status on logout:', err);
      // Continue with logout even if updating status fails
    }

    // Remove token from localStorage
    removeToken();

    // Clear state
    setToken(null);
    setUser(null);
    
    // Redirect to login page if router is provided
    if (router) {
      router.push('/login');
    }
  };

  // Role checking functions
  const hasRole = (roleId) => {
    return user && user.roleId === roleId;
  };

  const isAdmin = () => hasRole(ROLE_ADMIN);
  const isManager = () => hasRole(ROLE_MANAGER);
  const isSales = () => hasRole(ROLE_SALES);
  const isManagerOrHigher = () => isAdmin() || isManager();

  // Value object to be provided by the context
  const value = {
    user,
    token,
    loading,
    login,
    logout,
    hasRole,
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
