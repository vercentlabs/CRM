import type { AuthSessionView } from '@crm/types';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../components/ui/Toast';
import { createQueryClient } from '../lib/query';
import { ThemeProvider } from '../theme/ThemeProvider';
import { SessionProvider } from './SessionProvider';

/** Server state, theme, toasts and session. Tests pass their own query client/session. */
export function AppProviders({
  children,
  queryClient,
  initialSession,
}: {
  children: ReactNode;
  queryClient?: QueryClient;
  initialSession?: AuthSessionView | null;
}) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <ToastProvider>
            <SessionProvider {...(initialSession !== undefined ? { initialSession } : {})}>
              {children}
            </SessionProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
