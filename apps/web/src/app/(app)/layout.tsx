import { PageSkeleton } from '@crm/ui';
import { Suspense, type ReactNode } from 'react';
import { AuthGate } from '@/components/auth/AuthGate';
import { AppShell } from '@/components/navigation/AppShell';

/** Every authenticated route: session gate (no protected content before it resolves) + app shell. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AuthGate>
        <AppShell>
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </AppShell>
      </AuthGate>
    </Suspense>
  );
}
