import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from './config';

/**
 * Mobile token storage (Phase 2 model, unchanged):
 * - access token: memory only (15 minutes; re-obtained from the refresh token);
 * - refresh token: Expo SecureStore (Keychain / Keystore), rotated on every use.
 * Nothing token-related ever touches AsyncStorage or React state.
 * Keys are namespaced by API origin so different servers never share a session.
 */

let accessToken: string | null = null;

/** SecureStore keys may only contain alphanumerics, ".", "-" and "_". */
const refreshKey = () => `crm_refresh.${API_BASE_URL.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export const tokens = {
  getAccessToken: () => accessToken,

  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(refreshKey());
    } catch {
      return null;
    }
  },

  /** Stores a newly issued pair; a rotated refresh token replaces the old one. */
  async store(next: {
    accessToken?: string | undefined;
    refreshToken?: string | undefined;
  }): Promise<void> {
    if (next.accessToken) accessToken = next.accessToken;
    if (next.refreshToken) await SecureStore.setItemAsync(refreshKey(), next.refreshToken);
  },

  async clear(): Promise<void> {
    accessToken = null;
    await SecureStore.deleteItemAsync(refreshKey()).catch(() => undefined);
  },
};
