import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/constants';

const STORAGE_KEY = 'api_base_url_override';
const listeners = new Set<(baseUrl: string) => void>();
let cachedBaseUrl: string | null = null;

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

export const getDefaultApiBaseUrl = () => API_BASE_URL;

export const getApiBaseUrl = async () => {
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      cachedBaseUrl = normalizeBaseUrl(stored);
      return cachedBaseUrl;
    }
  } catch (error) {
    // ignore storage errors, fall back to default
  }
  cachedBaseUrl = normalizeBaseUrl(API_BASE_URL);
  return cachedBaseUrl;
};

export const setApiBaseUrl = async (value: string | null) => {
  if (!value) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    cachedBaseUrl = normalizeBaseUrl(API_BASE_URL);
    listeners.forEach((listener) => listener(cachedBaseUrl as string));
    return;
  }
  const normalized = normalizeBaseUrl(value.trim());
  cachedBaseUrl = normalized;
  await AsyncStorage.setItem(STORAGE_KEY, normalized);
  listeners.forEach((listener) => listener(normalized));
};

export const getCachedApiBaseUrl = () => {
  return cachedBaseUrl || normalizeBaseUrl(API_BASE_URL);
};

export const subscribeApiBaseUrl = (listener: (baseUrl: string) => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
