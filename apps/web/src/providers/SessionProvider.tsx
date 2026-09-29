'use client';

import type { Permission } from '@crm/permissions';
import type { AuthSessionView } from '@crm/types';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, onSessionEvent } from '@/lib/api';
import { csrf } from '@/lib/csrf';
import { isStatus } from '@/lib/errors';
import { setDisplayTimeZone } from '@/lib/format';
import { can, canAny, canOrg, scopeOf } from '@/lib/permissions';
import type { QueryKeyPart } from '@/lib/query';

/**
 * Web auth state. The session lives in HttpOnly cookies owned by the API;
 * this provider only mirrors the non-secret session view (user, active
 * organization, membership, permissions) and never stores tokens.
 */

export type SessionStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  /** Signed in, but the membership/organization is not usable (suspended, removed). */
  | 'no-access'
  /** The session could not be checked (network/server). */
  | 'error';

export interface LoginInput {
  email: string;
  password: string;
  organizationId?: string | undefined;
}

export interface SessionContextValue {
  status: SessionStatus;
  isAuthenticated: boolean;
  /** Set when an authenticated session ended on its own (expiry, revocation). */
  expired: boolean;
  session: AuthSessionView | null;
  user: AuthSessionView['user'] | null;
  organization: AuthSessionView['organization'] | null;
  membership: AuthSessionView['membership'] | null;
  permissions: AuthSessionView['permissions'];
  organizations: AuthSessionView['organizations'];
  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
  /** Organization-wide grant of a permission. */
  canOrg: (permission: Permission) => boolean;
  scopeOf: (permission: Permission) => 'own' | 'organization' | null;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  retry: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const EMPTY: AuthSessionView['permissions'] = {};

export function SessionProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  /** Tests only: start from a known session instead of asking the API. */
  initialSession?: AuthSessionView | null;
}) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSessionView | null>(() => {
    if (initialSession) csrf.set(initialSession.csrfToken);
    return initialSession ?? null;
  });
  const [status, setStatus] = useState<SessionStatus>(
    initialSession === undefined ? 'loading' : initialSession ? 'authenticated' : 'unauthenticated',
  );
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Dates render in the active organization's zone. Set during render (idempotent,
  // module-level) so the first paint after login or an organization switch is correct.
  setDisplayTimeZone(session?.organization.timezone);

  const apply = useCallback((next: AuthSessionView) => {
    csrf.set(next.csrfToken);
    setSession(next);
    setStatus('authenticated');
    setExpired(false);
  }, []);

  const reset = useCallback(
    (nextStatus: SessionStatus) => {
      csrf.clear();
      void queryClient.cancelQueries();
      queryClient.clear();
      setSession(null);
      setStatus(nextStatus);
    },
    [queryClient],
  );

  // Restore the session from the cookies (the client refreshes once on 401).
  useEffect(() => {
    if (initialSession !== undefined && attempt === 0) return;
    let active = true;
    api()
      .v1.auth.session()
      .then((next) => {
        if (active) apply(next);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (isStatus(error, 401)) reset('unauthenticated');
        else if (isStatus(error, 403)) reset('no-access');
        else setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [apply, reset, attempt, initialSession]);

  // Follow refreshes and expiries that happen during normal requests.
  const statusRef = useRef(status);
  const sessionRef = useRef(session);
  useEffect(() => {
    statusRef.current = status;
    sessionRef.current = session;
  }, [status, session]);

  useEffect(
    () =>
      onSessionEvent((event) => {
        if (event.type === 'refreshed') {
          // A refresh never changes organization; if it somehow did, drop tenant data.
          if (
            sessionRef.current &&
            sessionRef.current.organization.id !== event.session.organization.id
          ) {
            queryClient.clear();
          }
          csrf.set(event.session.csrfToken);
          setSession(event.session);
        } else if (statusRef.current === 'authenticated') {
          setExpired(true);
          reset('unauthenticated');
        }
      }),
    [queryClient, reset],
  );

  const login = useCallback(
    async (input: LoginInput) => {
      const next = await api().v1.auth.login({
        email: input.email,
        password: input.password,
        client: 'web',
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      });
      queryClient.clear();
      apply(next);
    },
    [apply, queryClient],
  );

  const logout = useCallback(async () => {
    const wasChatUser = Boolean(session?.permissions['crm.chat.use']);
    try {
      if (wasChatUser) await api().v1.chat.setPresence(false);
    } catch {
      // Presence is best effort.
    }
    try {
      await api().v1.auth.logout();
    } catch {
      // The server session expires on its own; local state is cleared regardless.
    }
    setExpired(false);
    reset('unauthenticated');
  }, [reset, session]);

  const switchOrganization = useCallback(
    async (organizationId: string) => {
      const next = await api().v1.auth.switchOrganization(organizationId);
      // Nothing from the previous organization may remain visible or cached.
      await queryClient.cancelQueries();
      queryClient.clear();
      apply(next);
    },
    [apply, queryClient],
  );

  const value = useMemo<SessionContextValue>(() => {
    const permissions = session?.permissions ?? EMPTY;
    return {
      status,
      isAuthenticated: status === 'authenticated' && session !== null,
      expired,
      session,
      user: session?.user ?? null,
      organization: session?.organization ?? null,
      membership: session?.membership ?? null,
      permissions,
      organizations: session?.organizations ?? [],
      can: (permission) => can(permissions, permission),
      canAny: (...list) => canAny(permissions, list),
      canOrg: (permission) => canOrg(permissions, permission),
      scopeOf: (permission) => scopeOf(permissions, permission),
      login,
      logout,
      switchOrganization,
      retry: () => {
        setStatus('loading');
        setAttempt((n) => n + 1);
      },
    };
  }, [status, session, expired, login, logout, switchOrganization]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

/**
 * Query keys scoped to the active organization: `['org', orgId, ...parts]`.
 * Use the same prefix to invalidate (e.g. `key('leads')`).
 */
export function useQueryKey() {
  const { organization } = useSession();
  const orgId = organization?.id ?? 'none';
  return useCallback((...parts: QueryKeyPart[]) => ['org', orgId, ...parts] as const, [orgId]);
}
