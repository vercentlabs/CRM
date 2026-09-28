import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from './index';
import {
  getStoredTheme,
  setStoredTheme,
  type ThemePreference
} from '../services/themeStorage';

type ThemeContextValue = {
  theme: Theme;
  mode: ThemePreference;
  resolvedMode: 'light' | 'dark';
  setMode: (mode: ThemePreference) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [mode, setModeState] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const stored = await getStoredTheme();
      if (active && stored) {
        setModeState(stored);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const resolvedMode = mode === 'system' ? systemScheme : mode;
  const theme = resolvedMode === 'dark' ? darkTheme : lightTheme;

  const setMode = (next: ThemePreference) => {
    setModeState(next);
    void setStoredTheme(next);
  };

  const toggleMode = () => {
    const next = resolvedMode === 'dark' ? 'light' : 'dark';
    setMode(next);
  };

  const value = {
    theme,
    mode,
    resolvedMode,
    setMode,
    toggleMode
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};

