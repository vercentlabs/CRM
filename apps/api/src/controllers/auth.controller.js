import { loginRequestSchema, toFieldIssues } from '@crm/validation';
import { resolveAuth } from '../platform/auth/middleware.js';
import { login as loginWithPassword, logout as endSession, logoutByRefreshToken } from '../platform/auth/service.js';
import { sendSuccess, sendValidationError } from '../utils/response.js';

/**
 * Legacy login (`POST /auth/login`) kept for already-installed mobile builds.
 * It now creates a server session and returns a short-lived access token plus
 * a rotating refresh token in the historical `{ success, message, data }` shape.
 * Browsers use `POST /api/v1/auth/login` (HttpOnly cookies) instead.
 */
const login = async (req, res) => {
  const parsed = loginRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, toFieldIssues(parsed.error));
  }

  const issued = await loginWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
    client: 'mobile',
    userAgent: req.get('User-Agent')
  });

  res.setHeader('Cache-Control', 'no-store');
  return sendSuccess(res, 'Login successful', {
    token: issued.accessToken,
    refreshToken: issued.refreshToken,
    expiresIn: Math.round((issued.accessTokenExpiresAt.getTime() - Date.now()) / 1000),
    user: {
      id: issued.subject.userId,
      email: issued.subject.email,
      roleId: issued.subject.legacyRoleId,
      name: issued.subject.name
    }
  });
};

/** Logout revokes the server session (access token, or refresh token when the access token expired). */
const logout = async (req, res) => {
  try {
    const subject = await resolveAuth(req);
    await endSession(subject.sessionId, subject.userId, subject.organizationId);
  } catch (error) {
    const refreshToken = req.body?.refreshToken;
    if (typeof refreshToken !== 'string' || !refreshToken) throw error;
    await logoutByRefreshToken(refreshToken);
  }
  return sendSuccess(res, 'Logout successful');
};

export {
  login,
  logout
};
