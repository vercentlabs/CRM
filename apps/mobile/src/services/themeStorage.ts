import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'crm.theme';

export type ThemePreference = 'light' | 'dark' | 'system';

export const getStoredTheme = async (): Promise<ThemePreference | null> => {
  const stored = await AsyncStorage.getItem(THEME_KEY);
  if (!stored) return null;
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return null;
};

export const setStoredTheme = async (value: ThemePreference) => {
  await AsyncStorage.setItem(THEME_KEY, value);
};

export const clearStoredTheme = async () => {
  await AsyncStorage.removeItem(THEME_KEY);
};

