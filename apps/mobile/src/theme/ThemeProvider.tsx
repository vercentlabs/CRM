import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from './index';

export type ThemePreference = 'light' | 'dark' | 'system';

/** A per-device display preference (not account data), so AsyncStorage is appropriate. */
const THEME_KEY = 'crm.theme';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemePreference;
  resolvedMode: 'light' | 'dark';
  setMode: (mode: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [mode, setModeState] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_KEY)
      .then((stored) => {
        if (active && (stored === 'light' || stored === 'dark' || stored === 'system'))
          setModeState(stored);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemePreference) => {
    setModeState(next);
    AsyncStorage.setItem(THEME_KEY, next).catch(() => undefined);
  }, []);

  const resolvedMode = mode === 'system' ? systemScheme : mode;
  const value = useMemo(
    () => ({
      theme: resolvedMode === 'dark' ? darkTheme : lightTheme,
      mode,
      resolvedMode,
      setMode,
    }),
    [mode, resolvedMode, setMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

/** Shorthand for the current colour tokens. */
export const useColors = () => useTheme().theme.colors;
