/**
 * CSRF token of the current cookie session. Held in memory only: it is
 * returned by login/session/refresh and echoed as `x-csrf-token` on unsafe
 * requests. Access and refresh tokens are HttpOnly cookies JavaScript never sees.
 */
let token: string | null = null;

export const csrf = {
  get: () => token,
  set: (value: string | null | undefined) => {
    token = typeof value === 'string' && value ? value : null;
  },
  clear: () => {
    token = null;
  },
};
