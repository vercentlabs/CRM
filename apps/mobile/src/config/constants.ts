import { NativeModules, Platform } from 'react-native';

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const getDevServerHost = () => {
  const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
  if (!scriptURL) return null;
  const match = scriptURL.match(/^(?:https?|exp|exps):\/\/([^:/]+)(?::\d+)?/);
  return match ? match[1] : null;
};

const resolveBaseUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) return normalizeBaseUrl(envUrl);

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const host = getDevServerHost();
    if (host) return `http://${host}:5000`;
    if (Platform.OS === 'android') return 'http://10.0.2.2:5000';
  }

  return 'http://localhost:5000';
};

export const API_BASE_URL = resolveBaseUrl();

// Role constants (must match backend)
export const ROLE_ADMIN = 1;
export const ROLE_MANAGER = 2;
export const ROLE_SALES = 3;
