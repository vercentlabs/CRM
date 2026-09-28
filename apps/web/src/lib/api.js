import axios from 'axios';
import { clearSession, getCsrfToken, setCsrfToken } from './session';

/**
 * The single API client for the web app.
 *
 * - Auth uses HttpOnly cookies (`withCredentials`); no token is ever read from
 *   or written to JavaScript-accessible storage.
 * - Unsafe requests carry the session CSRF token.
 * - A 401 triggers one cookie refresh (rotating refresh token) and a retry.
 */
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 10000, // 10 seconds timeout
});

const SAFE_METHODS = ['get', 'head', 'options'];
const AUTH_PATHS = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout'];

api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  const csrf = getCsrfToken();
  if (csrf && !SAFE_METHODS.includes(method)) {
    config.headers['x-csrf-token'] = csrf;
  }
  return config;
});

let refreshInFlight = null;

/** Rotates the refresh cookie once, shared by concurrent 401s. */
export const refreshSession = () => {
  if (!refreshInFlight) {
    refreshInFlight = api
      .post('/api/v1/auth/refresh', undefined, { skipAuthRefresh: true })
      .then((response) => {
        setCsrfToken(response.data?.data?.csrfToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

const redirectToLogin = () => {
  clearSession();
  if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthEndpoint = AUTH_PATHS.some((path) => config?.url?.includes(path));

    if (response?.status === 401 && config && !config.skipAuthRefresh && !isAuthEndpoint) {
      if (!config._retried && (await refreshSession())) {
        config._retried = true;
        if (config.headers && !SAFE_METHODS.includes((config.method || 'get').toLowerCase())) {
          config.headers['x-csrf-token'] = getCsrfToken();
        }
        return api.request(config);
      }
      redirectToLogin();
    } else if (response?.status >= 500) {
      console.error('Server error:', response.data?.message || 'Something went wrong on the server');
    } else if (!response && error.request) {
      console.error('Network error:', 'No response received from server');
    }

    return Promise.reject(error);
  }
);

export default api;
