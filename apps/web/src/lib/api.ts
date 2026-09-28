import { createApiClient, type ApiClient } from '@crm/api-client';
import type { AuthSessionView } from '@crm/types';
import { csrf } from './csrf';
import { API_BASE_URL } from './env';

/**
 * The web app's only API integration (cookie mode): HttpOnly session cookies,
 * CSRF header on unsafe methods, request ids, one shared refresh on 401.
 * UI code calls `api().v1.<resource>`; it never builds endpoint URLs itself.
 */

export type SessionEvent = { type: 'refreshed'; session: AuthSessionView } | { type: 'expired' };
type SessionListener = (event: SessionEvent) => void;

const listeners = new Set<SessionListener>();

export function onSessionEvent(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(event: SessionEvent) {
  for (const listener of listeners) listener(event);
}

export function createWebApiClient(
  options: { fetch?: typeof fetch; baseUrl?: string } = {},
): ApiClient {
  const client: ApiClient = createApiClient({
    baseUrl: options.baseUrl ?? API_BASE_URL,
    credentials: 'include',
    ...(options.fetch ? { fetch: options.fetch } : {}),
    getCsrfToken: () => csrf.get(),
    refreshSession: async () => {
      try {
        const session = await client.v1.auth.refresh();
        csrf.set(session.csrfToken);
        emit({ type: 'refreshed', session });
        return true;
      } catch {
        return false;
      }
    },
    onUnauthorized: () => emit({ type: 'expired' }),
  });
  return client;
}

let client: ApiClient = createWebApiClient();

/** The shared client. A function so tests can swap it (see `setApiClient`). */
export const api = (): ApiClient => client;

/** Test seam: replace the client (e.g. with one using a mocked fetch). */
export function setApiClient(next: ApiClient): void {
  client = next;
}
