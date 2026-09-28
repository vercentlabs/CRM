import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser } from '../types/auth';
import { getApiBaseUrl } from './apiBase';

const TOKEN_KEY = 'crm.token';
const USER_KEY = 'crm.user';

const buildKey = (prefix: string, baseUrl: string) => {
  return `${prefix}:${encodeURIComponent(baseUrl)}`;
};

const resolveBaseUrl = async (override?: string) => {
  if (override) return override;
  return getApiBaseUrl();
};

export const getToken = async (baseUrl?: string) => {
  const resolved = await resolveBaseUrl(baseUrl);
  return AsyncStorage.getItem(buildKey(TOKEN_KEY, resolved));
};

export const setToken = async (token: string, baseUrl?: string) => {
  const resolved = await resolveBaseUrl(baseUrl);
  await AsyncStorage.setItem(buildKey(TOKEN_KEY, resolved), token);
};

export const clearToken = async (baseUrl?: string) => {
  const resolved = await resolveBaseUrl(baseUrl);
  await AsyncStorage.removeItem(buildKey(TOKEN_KEY, resolved));
};

export const getStoredUser = async (baseUrl?: string) => {
  const resolved = await resolveBaseUrl(baseUrl);
  const raw = await AsyncStorage.getItem(buildKey(USER_KEY, resolved));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch (error) {
    await AsyncStorage.removeItem(buildKey(USER_KEY, resolved));
    return null;
  }
};

export const setStoredUser = async (user: AuthUser, baseUrl?: string) => {
  const resolved = await resolveBaseUrl(baseUrl);
  await AsyncStorage.setItem(buildKey(USER_KEY, resolved), JSON.stringify(user));
};

export const clearStoredUser = async (baseUrl?: string) => {
  const resolved = await resolveBaseUrl(baseUrl);
  await AsyncStorage.removeItem(buildKey(USER_KEY, resolved));
};

export const clearStoredAuth = async (baseUrl?: string) => {
  await Promise.all([clearToken(baseUrl), clearStoredUser(baseUrl)]);
};
