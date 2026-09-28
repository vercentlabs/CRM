/** Public (browser-safe) configuration. Never put secrets in NEXT_PUBLIC_* variables. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:5000';
