
/**
 * Application constants
 */

// API Base URL - Update this to match your backend API
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

// Role constants
export const ROLE_ADMIN = 1;
export const ROLE_MANAGER = 2;
export const ROLE_SALES = 3;
export const ROLE_USER = 4;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Date formats
export const DATE_FORMAT = 'YYYY-MM-DD';
export const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

// Local storage keys
export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user_data',
  THEME: 'theme_preference',
};
