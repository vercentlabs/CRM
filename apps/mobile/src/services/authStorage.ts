import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { AuthUser } from '../types/auth';
import { getApiBaseUrl } from './apiBase';

/**
 * Session storage (Phase 2):
 * - Refresh token: Expo SecureStore (iOS Keychain / Android Keystore), never AsyncStorage.
 * - Access token: memory only (short-lived; re-obtained with the refresh token after restart).
 * - User profile (non-sensitive, for fast startup): AsyncStorage.
 * Everything is namespaced per API base URL because the app can switch servers.
 */
const LEGACY_TOKEN_KEY = 'crm.token';
const USER_KEY = 'crm.user';
const REFRESH_KEY = 'crm_refresh';

const accessTokens = new Map<string, string>();

const asyncKey = (prefix: string, baseUrl: string) => `${prefix}:${encodeURIComponent(baseUrl)}`;

/** SecureStore keys may only contain alphanumerics, ".", "-" and "_". */
const secureKey = (baseUrl: string) => `${REFRESH_KEY}.${baseUrl.replace(/[^A-Za-z0-9._-]/g, '_')}`;

const resolveBaseUrl = async (override?: string) => {
  if (override) return override;
  return getApiBaseUrl();
};

export const getToken = async (baseUrl?: string) => {
  const resolved = await resolveBaseUrl(baseUrl);
  return accessTokens.get(resolved) ?? null;
};

export const getRefreshToken = async (baseUrl?: string) => {
  const resolved = await resolveBaseUrl(baseUrl);
  try {
    return await SecureStore.getItemAsync(secureKey(resolved));
  } catch {
    return null;
  }
};

/** Stores a freshly issued token pair (rotation replaces the refresh token). */
export const setSessionTokens = async (
  tokens: { accessToken: string; refreshToken?: string },
  baseUrl?: string
) => {
  const resolved = await resolveBaseUrl(baseUrl);
  accessTokens.set(resolved, tokens.accessToken);
  if (tokens.refreshToken) {
    await SecureStore.setItemAsync(secureKey(resolved), tokens.refreshToken);
  }
};

export const getStoredUser = async (baseUrl?: string) => {
  const resolved = await resolveBaseUrl(baseUrl);
  const raw = await AsyncStorage.getItem(asyncKey(USER_KEY, resolved));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    await AsyncStorage.removeItem(asyncKey(USER_KEY, resolved));
    return null;
  }
};

export const setStoredUser = async (user: AuthUser, baseUrl?: string) => {
  const resolved = await resolveBaseUrl(baseUrl);
  await AsyncStorage.setItem(asyncKey(USER_KEY, resolved), JSON.stringify(user));
};

export const clearStoredAuth = async (baseUrl?: string) => {
  const resolved = await resolveBaseUrl(baseUrl);
  accessTokens.delete(resolved);
  await Promise.all([
    AsyncStorage.removeItem(asyncKey(USER_KEY, resolved)),
    // Pre-Phase-2 builds kept a 24h JWT in plain AsyncStorage; remove it.
    AsyncStorage.removeItem(asyncKey(LEGACY_TOKEN_KEY, resolved)),
    SecureStore.deleteItemAsync(secureKey(resolved)).catch(() => undefined)
  ]);
};

export const purgeLegacyToken = async (baseUrl?: string) => {
  const resolved = await resolveBaseUrl(baseUrl);
  await AsyncStorage.removeItem(asyncKey(LEGACY_TOKEN_KEY, resolved));
};
