import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiRequest, refreshSession, setUnauthorizedHandler } from '../services/api';
import {
  clearStoredAuth,
  getRefreshToken,
  getStoredUser,
  purgeLegacyToken,
  setSessionTokens,
  setStoredUser
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
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: () => boolean;
  isManager: () => boolean;
  isSales: () => boolean;
  isManagerOrHigher: () => boolean;
  hasPermission: (permission: string) => boolean;
};

/** Shape of /api/v1/auth/* responses for mobile clients (see @crm/types AuthSessionView). */
type SessionPayload = {
  user: { id: number; email: string; roleId: number | null; name: string };
  organization: { id: string; name: string; slug: string };
  membership: { role: { key: string; name: string } };
  permissions: Record<string, string>;
  accessToken?: string;
  refreshToken?: string;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const toAuthUser = (session: SessionPayload): AuthUser => ({
  id: session.user.id,
  email: session.user.email,
  // DEPRECATED legacy id used only for existing role-based navigation; custom roles
  // fall back to the least-privileged UI (the API enforces real permissions).
  roleId: session.user.roleId ?? ROLE_SALES,
  name: session.user.name || session.user.email,
  organization: session.organization,
  role: session.membership?.role,
  permissions: session.permissions
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const session = await apiRequest<SessionPayload>('/api/v1/auth/session');
      if (session?.user) {
        const normalized = toAuthUser(session);
        setUser(normalized);
        await setStoredUser(normalized);
      }
    } catch {
      // Keep the cached user; unauthorized errors are handled globally.
    }
  }, []);

  const handleUnauthorized = useCallback(async () => {
    await clearStoredAuth();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void handleUnauthorized();
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [handleUnauthorized]);

  /** Restores the session for a base URL using the SecureStore refresh token. */
  const restoreSession = useCallback(
    async (baseUrl: string) => {
      await purgeLegacyToken(baseUrl);
      const [storedUser, refreshToken] = await Promise.all([getStoredUser(baseUrl), getRefreshToken(baseUrl)]);
      if (!refreshToken) {
        setUser(null);
        return;
      }
      setUser(storedUser);
      if (await refreshSession()) {
        await refreshUser();
      } else {
        await clearStoredAuth(baseUrl);
        setUser(null);
      }
    },
    [refreshUser]
  );

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        await restoreSession(await getApiBaseUrl());
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
  }, [restoreSession]);

  useEffect(() => {
    const unsubscribe = subscribeApiBaseUrl((baseUrl) => {
      void restoreSession(baseUrl);
    });

    return () => {
      unsubscribe();
    };
  }, [restoreSession]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const baseUrl = await getApiBaseUrl();
      const session = await apiRequest<SessionPayload>('/api/v1/auth/login', {
        method: 'POST',
        body: { email, password, client: 'mobile' },
        skipAuthRefresh: true
      });

      if (!session?.accessToken || !session.refreshToken || !session.user) {
        return { success: false, error: 'Invalid login response.' };
      }

      const normalized = toAuthUser(session);
      await setSessionTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken }, baseUrl);
      await setStoredUser(normalized, baseUrl);
      setUser(normalized);

      return { success: true };
    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error) {
        return { success: false, error: String((error as { message?: string }).message) };
      }
      return { success: false, error: 'Login failed. Please try again.' };
    }
  };

  /** Revokes the server session (works even if the access token already expired). */
  const logout = async () => {
    try {
      const refreshToken = await getRefreshToken();
      await apiRequest('/api/v1/auth/logout', {
        method: 'POST',
        body: refreshToken ? { refreshToken } : {},
        skipAuthRefresh: true
      });
    } catch {
      // Clear locally regardless; the server session also expires on its own.
    } finally {
      await clearStoredAuth();
      setUser(null);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshUser,
      isAuthenticated: Boolean(user),
      isAdmin: () => user?.roleId === ROLE_ADMIN,
      isManager: () => user?.roleId === ROLE_MANAGER,
      isSales: () => user?.roleId === ROLE_SALES,
      isManagerOrHigher: () =>
        user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER,
      hasPermission: (permission: string) => Boolean(user?.permissions?.[permission])
    }),
    // login/logout are recreated per render but only close over stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading, refreshUser]
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
