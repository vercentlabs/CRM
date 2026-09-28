import { ApiClientError } from '@crm/api-client';
import { QueryClient } from '@tanstack/react-query';

/**
 * Server state lives in TanStack Query (same model as the web app). Every key
 * starts with ['org', <organization public id>] via `useQueryKey()`, and
 * switching organization clears the cache, so tenants never share data.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        // Client errors (validation, 403, 404) are final; retry transient failures only.
        retry: (failureCount, error) =>
          failureCount < 2 &&
          (!(error instanceof ApiClientError) || error.status === 0 || error.status >= 500),
      },
      mutations: { retry: false },
    },
  });
}

export type QueryKeyPart = string | number | boolean | null | undefined | Record<string, unknown>;
