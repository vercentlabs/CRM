'use client';

import { Button, ErrorState, Spinner } from '@crm/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/providers/SessionProvider';

/** Where to return after signing in (same-origin paths only). */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/dashboard';
  }
  return value;
}

/**
 * Protects every authenticated route (used once, in the (app) layout):
 * nothing protected renders until the session is known, unauthenticated
 * visitors are sent to /login, and unusable memberships get an explanation.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, expired, logout, retry } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (status !== 'unauthenticated') return;
    const query = search.toString();
    const next = encodeURIComponent(`${pathname}${query ? `?${query}` : ''}`);
    router.replace(`/login?next=${next}${expired ? '&reason=expired' : ''}`);
  }, [status, expired, pathname, search, router]);

  if (status === 'authenticated') return <>{children}</>;

  if (status === 'no-access') {
    return (
      <CenteredPanel>
        <ErrorState
          title="Your access to this organization is not active"
          description="The membership may have been suspended or removed, or the organization is unavailable. Contact your administrator."
          action={
            <Button variant="primary" onClick={() => void logout()}>
              Sign out
            </Button>
          }
        />
      </CenteredPanel>
    );
  }

  if (status === 'error') {
    return (
      <CenteredPanel>
        <ErrorState
          title="Could not check your session"
          description="The server could not be reached."
          action={<Button onClick={retry}>Try again</Button>}
        />
      </CenteredPanel>
    );
  }

  return (
    <CenteredPanel>
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner label="Loading your workspace" /> Loading your workspace…
      </div>
    </CenteredPanel>
  );
}

function CenteredPanel({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-4">{children}</div>;
}
