/**
 * In-memory browser session state.
 *
 * Authentication lives in HttpOnly cookies set by the API (never readable by
 * JavaScript). The only value kept here is the CSRF token returned by
 * /api/v1/auth/login|session, echoed as `x-csrf-token` on unsafe requests.
 * It is intentionally not persisted: after a reload it is fetched again.
 */
let csrfToken = null;

export const getCsrfToken = () => csrfToken;

export const setCsrfToken = (value) => {
  csrfToken = typeof value === 'string' && value ? value : null;
};

export const clearSession = () => {
  csrfToken = null;
};

/** Removes the pre-Phase-2 long-lived JWT that older builds kept in localStorage. */
export const purgeLegacyToken = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem('token');
  } catch {
    // Storage may be unavailable (private mode); nothing to clean up then.
  }
};
