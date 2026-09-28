'use client';

import type { AuthSessionView } from '@crm/types';
import { ToastProvider } from '@crm/ui';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createQueryClient } from '@/lib/query';
import { SessionProvider } from './SessionProvider';
import { ThemeProvider } from './ThemeProvider';

/** Client-side providers: server state, session, theme and the single toast surface. */
export function AppProviders({
  children,
  queryClient,
  initialSession,
}: {
  children: ReactNode;
  /** Tests only. */
  queryClient?: QueryClient;
  /** Tests only. */
  initialSession?: AuthSessionView | null;
}) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ToastProvider>
          <SessionProvider {...(initialSession !== undefined ? { initialSession } : {})}>
            {children}
          </SessionProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
