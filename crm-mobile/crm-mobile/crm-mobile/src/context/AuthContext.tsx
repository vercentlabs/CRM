import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiRequest, setUnauthorizedHandler } from '../services/api';
import {
  clearStoredAuth,
  getStoredUser,
  getToken,
  setStoredUser,
  setToken as persistToken
} from '../services/authStorage';
import { getApiBaseUrl, subscribeApiBaseUrl } from '../services/apiBase';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '../config/constants';
import type { AuthUser } from '../types/auth';

type LoginResult = {
  success: boolean;
  error?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: () => boolean;
  isManager: () => boolean;
  isSales: () => boolean;
  isManagerOrHigher: () => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const normalizeUser = (raw: {
  id: number;
  email: string;
  roleId?: number;
  role_id?: number;
  full_name?: string | null;
  username?: string | null;
  name?: string | null;
}): AuthUser => {
  return {
    id: raw.id,
    email: raw.email,
    roleId: raw.roleId ?? raw.role_id ?? ROLE_SALES,
    name: raw.full_name || raw.username || raw.name || raw.email
  };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const activeToken = token ?? (await getToken());
    if (!activeToken) return;
    try {
      const response = await apiRequest<{
        success: boolean;
        user: {
          id: number;
          full_name?: string | null;
          email: string;
          username?: string | null;
          roleId?: number;
          role_id?: number;
        };
      }>('/users/me');

      if (response?.user) {
        const normalized = normalizeUser(response.user);
        setUser(normalized);
        await setStoredUser(normalized);
      }
    } catch (error) {
      // If refreshing fails, keep existing user but allow the app to proceed
      // Unauthorized errors will be handled by the global handler
    }
  };

  const handleUnauthorized = async () => {
    await clearStoredAuth();
    setUser(null);
    setToken(null);
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void handleUnauthorized();
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([getToken(), getStoredUser()]);

        if (!mounted) return;

        if (storedToken) {
          setToken(storedToken);
        }

        if (storedUser) {
          setUser(storedUser);
        }

        if (storedToken) {
          await refreshUser();
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void initializeAuth();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeApiBaseUrl((baseUrl) => {
      const syncAuth = async () => {
        const [storedToken, storedUser] = await Promise.all([
          getToken(baseUrl),
          getStoredUser(baseUrl)
        ]);

        setToken(storedToken);
        setUser(storedUser);

        if (storedToken) {
          await refreshUser();
        }
      };

      void syncAuth();
    });

    return () => {
      unsubscribe();
    };
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const baseUrl = await getApiBaseUrl();
      const data = await apiRequest<{
        token: string;
        user: {
          id: number;
          email: string;
          roleId?: number;
          role_id?: number;
          name?: string | null;
          full_name?: string | null;
          username?: string | null;
        };
      }>('/auth/login', {
        method: 'POST',
        body: { email, password }
      });

      if (!data?.token || !data.user) {
        return { success: false, error: 'Invalid login response.' };
      }

      const normalized = normalizeUser(data.user);
      await persistToken(data.token, baseUrl);
      await setStoredUser(normalized, baseUrl);
      setToken(data.token);
      setUser(normalized);

      return { success: true };
    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error) {
        return { success: false, error: String((error as { message?: string }).message) };
      }
      return { success: false, error: 'Login failed. Please try again.' };
    }
  };

  const logout = async () => {
    await clearStoredAuth();
    setUser(null);
    setToken(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      refreshUser,
      isAuthenticated: Boolean(user && token),
      isAdmin: () => user?.roleId === ROLE_ADMIN,
      isManager: () => user?.roleId === ROLE_MANAGER,
      isSales: () => user?.roleId === ROLE_SALES,
      isManagerOrHigher: () =>
        user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER
    }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
