import { ApiClientError } from '@crm/api-client';
import { QueryClient } from '@tanstack/react-query';

/**
 * Server state lives in TanStack Query. Every query key starts with
 * `['org', <organization public id>]` (see `useQueryKey`), so data can never
 * be served across organizations; switching organization also clears the cache.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
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
