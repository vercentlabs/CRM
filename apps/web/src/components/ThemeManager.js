'use client';

import { useEffect } from 'react';
import { getStoredTheme, setTheme } from '@/lib/theme';

const ThemeManager = () => {
  useEffect(() => {
    const stored = getStoredTheme();
    const theme = stored || 'light';
    setTheme(theme, { persist: Boolean(stored) });
  }, []);

  return null;
};

export default ThemeManager;
