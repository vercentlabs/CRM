import { NativeModules, Platform } from 'react-native';

const normalize = (value: string) => value.replace(/\/+$/, '');

/** Development: talk to the API on the machine running Metro. */
function devServerHost(): string | null {
  const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
  const match = scriptURL?.match(/^(?:https?|exp|exps):\/\/([^:/]+)(?::\d+)?/);
  return match?.[1] ?? null;
}

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (fromEnv) return normalize(fromEnv);
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const host = devServerHost();
    if (host) return `http://${host}:5000`;
    if (Platform.OS === 'android') return 'http://10.0.2.2:5000';
  }
  return 'http://localhost:5000';
}

/** API origin (EXPO_PUBLIC_API_BASE_URL). Public configuration only: never secrets. */
export const API_BASE_URL = resolveBaseUrl();
