import { ApiClientError, createApiClient, type ApiClient } from '@crm/api-client';
import type { AuthSessionView } from '@crm/types';
import { API_BASE_URL } from './config';
import { tokens } from './tokens';

/**
 * The mobile app's only API integration: @crm/api-client in bearer mode.
 * Screens call `api().v1.<resource>`; they never build URLs or read tokens.
 *
 * On a 401 the client calls `refreshSession` once (shared by concurrent
 * requests): the SecureStore refresh token is exchanged for a new pair, which
 * is stored before the failed request is retried. A failed refresh clears the
 * tokens and reports the session as expired.
 */

export type SessionEvent = { type: 'refreshed'; session: AuthSessionView } | { type: 'expired' };
type Listener = (event: SessionEvent) => void;
const listeners = new Set<Listener>();

export function onSessionEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const emit = (event: SessionEvent) => listeners.forEach((listener) => listener(event));

export function createMobileApiClient(
  options: { fetch?: typeof fetch; baseUrl?: string } = {},
): ApiClient {
  const client: ApiClient = createApiClient({
    baseUrl: options.baseUrl ?? API_BASE_URL,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    getToken: () => tokens.getAccessToken(),
    timeoutMs: 15_000,
    refreshSession: async () => {
      const refreshToken = await tokens.getRefreshToken();
      if (!refreshToken) return false;
      try {
        const session = await client.v1.auth.refresh(refreshToken);
        await tokens.store(session);
        emit({ type: 'refreshed', session });
        return true;
      } catch (error) {
        // Revoked/expired/reused refresh token: the session is over. Network
        // failures keep the token so the user is not signed out while offline.
        if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
          await tokens.clear();
        }
        return false;
      }
    },
    onUnauthorized: () => emit({ type: 'expired' }),
  });
  return client;
}

let client: ApiClient = createMobileApiClient();

/** The shared client (a function so tests can swap it with `setApiClient`). */
export const api = (): ApiClient => client;

export function setApiClient(next: ApiClient): void {
  client = next;
}
