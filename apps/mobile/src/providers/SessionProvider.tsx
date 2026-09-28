import type { Permission } from '@crm/permissions';
import { canAnyIn, canIn, canOrgIn, scopeIn } from '@crm/permissions';
import type { AuthSessionView } from '@crm/types';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, onSessionEvent } from '../lib/api';
import { isStatus } from '../lib/errors';
import type { QueryKeyPart } from '../lib/query';
import { tokens } from '../lib/tokens';

/**
 * Mobile auth state. Tokens stay in lib/tokens (access token in memory,
 * refresh token in SecureStore); screens only see the session view: user,
 * organization, membership, organizations and permissions.
 */

export type SessionStatus =
  | 'starting'
  | 'signed-out'
  | 'signed-in'
  /** Signed in, but the membership/organization is not usable (suspended, removed). */
  | 'no-access'
  /** The session could not be checked (offline/server); the refresh token is kept. */
  | 'error';

export interface SessionContextValue {
  status: SessionStatus;
  isAuthenticated: boolean;
  /** An authenticated session ended on its own (expiry, revocation). */
  expired: boolean;
  user: AuthSessionView['user'] | null;
  organization: AuthSessionView['organization'] | null;
  membership: AuthSessionView['membership'] | null;
  organizations: AuthSessionView['organizations'];
  permissions: AuthSessionView['permissions'];
  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
  canOrg: (permission: Permission) => boolean;
  scopeOf: (permission: Permission) => 'own' | 'organization' | null;
  login: (input: {
    email: string;
    password: string;
    organizationId?: string | undefined;
  }) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  retry: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const NO_PERMISSIONS: AuthSessionView['permissions'] = {};

export function SessionProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  /** Tests only: start signed in (or signed out with `null`) without restoring. */
  initialSession?: AuthSessionView | null;
}) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSessionView | null>(initialSession ?? null);
  const [status, setStatus] = useState<SessionStatus>(
    initialSession === undefined ? 'starting' : initialSession ? 'signed-in' : 'signed-out',
  );
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);

  /** Drops tenant data and in-flight requests (sign-out, switch, expiry). */
  const clearTenantData = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);

  const apply = useCallback(async (next: AuthSessionView) => {
    await tokens.store(next);
    // The session view is kept in memory only; tokens never reach React state.
    const { accessToken: _a, refreshToken: _r, ...view } = next;
    setSession(view as AuthSessionView);
    setExpired(false);
    setStatus('signed-in');
  }, []);

  const signOutLocally = useCallback(
    async (nextStatus: SessionStatus = 'signed-out') => {
      await tokens.clear();
      await clearTenantData();
      setSession(null);
      setStatus(nextStatus);
    },
    [clearTenantData],
  );

  // Restore: exchange the SecureStore refresh token for a new session.
  useEffect(() => {
    if (initialSession !== undefined && attempt === 0) return;
    let active = true;
    (async () => {
      const refreshToken = await tokens.getRefreshToken();
      if (!refreshToken) {
        if (active) setStatus('signed-out');
        return;
      }
      try {
        const next = await api().v1.auth.refresh(refreshToken);
        if (active) await apply(next);
      } catch (error) {
        if (!active) return;
        if (isStatus(error, 401)) await signOutLocally('signed-out');
        else if (isStatus(error, 403)) await signOutLocally('no-access');
        else setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [apply, signOutLocally, attempt, initialSession]);

  // Follow token rotations and expiries that happen during normal requests.
  const signedIn = status === 'signed-in';
  useEffect(
    () =>
      onSessionEvent((event) => {
        if (event.type === 'refreshed') {
          const { accessToken: _a, refreshToken: _r, ...view } = event.session;
          setSession(view as AuthSessionView);
        } else if (signedIn) {
          setExpired(true);
          void signOutLocally('signed-out');
        }
      }),
    [signedIn, signOutLocally],
  );

  const login = useCallback<SessionContextValue['login']>(
    async ({ email, password, organizationId }) => {
      const next = await api().v1.auth.login({
        email,
        password,
        client: 'mobile',
        ...(organizationId ? { organizationId } : {}),
      });
      await clearTenantData();
      await apply(next);
    },
    [apply, clearTenantData],
  );

  const logout = useCallback(async () => {
    const hadChat = Boolean(session?.permissions['crm.chat.use']);
    try {
      if (hadChat) await api().v1.chat.setPresence(false);
    } catch {
      // Presence is best effort.
    }
    try {
      // The refresh token lets the server revoke the session even if the access token expired.
      await api().v1.auth.logout((await tokens.getRefreshToken()) ?? undefined);
    } catch {
      // The session also expires server-side; local state is cleared regardless.
    }
    setExpired(false);
    await signOutLocally('signed-out');
  }, [session, signOutLocally]);

  const switchOrganization = useCallback(
    async (organizationId: string) => {
      const next = await api().v1.auth.switchOrganization(organizationId);
      // Nothing from the previous organization may remain visible or cached.
      await clearTenantData();
      await apply(next);
    },
    [apply, clearTenantData],
  );

  const value = useMemo<SessionContextValue>(() => {
    const permissions = session?.permissions ?? NO_PERMISSIONS;
    return {
      status,
      isAuthenticated: status === 'signed-in' && session !== null,
      expired,
      user: session?.user ?? null,
      organization: session?.organization ?? null,
      membership: session?.membership ?? null,
      organizations: session?.organizations ?? [],
      permissions,
      can: (p) => canIn(permissions, p),
      canAny: (...list) => canAnyIn(permissions, list),
      canOrg: (p) => canOrgIn(permissions, p),
      scopeOf: (p) => scopeIn(permissions, p),
      login,
      logout,
      switchOrganization,
      retry: () => {
        setStatus('starting');
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

/** Query keys scoped to the active organization: ['org', orgId, ...parts]. */
export function useQueryKey() {
  const { organization } = useSession();
  const orgId = organization?.id ?? 'none';
  return useCallback((...parts: QueryKeyPart[]) => ['org', orgId, ...parts] as const, [orgId]);
}
