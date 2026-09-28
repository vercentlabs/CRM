import { STORAGE_KEYS } from '@/config/constants';

export const getStoredTheme = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.THEME);
};

export const getSystemTheme = () => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const setTheme = (theme, options = {}) => {
  const { persist = true } = options;
  if (typeof document === 'undefined') return;

  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;

  if (persist && typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme } }));
  }
};

