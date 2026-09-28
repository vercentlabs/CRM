/**
 * Browser authentication helpers (Phase 2 session model).
 *
 * The API sets HttpOnly cookies on login; JavaScript never sees or stores the
 * access/refresh tokens. The session payload (user, organization, membership,
 * permissions, csrfToken) comes back in the response body.
 */

import api, { refreshSession } from './api';
import { clearSession, purgeLegacyToken, setCsrfToken } from './session';

/** Maps the /api/v1/auth session payload to the user object the UI already uses. */
export const toUiUser = (session) => ({
  id: session.user.id,
  // DEPRECATED legacy role id kept for existing role-based menus (display only).
  roleId: session.user.roleId,
  email: session.user.email,
  name: session.user.name,
  role: session.membership?.role,
  organization: session.organization,
  organizations: session.organizations || [],
  permissions: session.permissions || {},
});

const applySession = (session) => {
  setCsrfToken(session?.csrfToken);
  return toUiUser(session);
};

const errorMessage = (error, fallback) =>
  error?.response?.data?.error?.message || error?.response?.data?.message || fallback;

// Login function (cookie session)
export const login = async (email, password, organizationId) => {
  try {
    purgeLegacyToken();
    const response = await api.post('/api/v1/auth/login', {
      email,
      password,
      client: 'web',
      ...(organizationId ? { organizationId } : {}),
    });
    return { success: true, user: applySession(response.data.data) };
  } catch (error) {
    return { success: false, error: errorMessage(error, 'Login failed. Please try again.') };
  }
};

/** Loads the current session from the cookies (refreshing once if the access cookie expired). */
export const fetchSession = async () => {
  purgeLegacyToken();
  try {
    const response = await api.get('/api/v1/auth/session', { skipAuthRefresh: true });
    return applySession(response.data.data);
  } catch (error) {
    if (error?.response?.status !== 401 || !(await refreshSession())) return null;
    try {
      const response = await api.get('/api/v1/auth/session', { skipAuthRefresh: true });
      return applySession(response.data.data);
    } catch {
      return null;
    }
  }
};

/** Revokes the server session and clears the cookies. */
export const logout = async () => {
  try {
    await api.post('/api/v1/auth/logout');
  } catch {
    // Even if the request fails, local state is cleared; the session expires server-side.
  } finally {
    clearSession();
  }
};

export const switchOrganization = async (organizationId) => {
  const response = await api.post('/api/v1/auth/switch-organization', { organizationId });
  return applySession(response.data.data);
};

/** UI-only permission check (the API enforces every permission server-side). */
export const can = (user, permission) => Boolean(user?.permissions?.[permission]);
