'use client';

import { Button, ErrorState, PageSkeleton, PermissionDenied } from '@crm/ui';
import type { ReactNode } from 'react';
import { isStatus, toDisplayError } from '@/lib/errors';

/**
 * Standard error rendering for a failed query: permission denied (403),
 * not found (404, also used for other organizations' records) or a generic
 * error with the request id and a retry.
 */
export function ApiErrorState({
  error,
  onRetry,
  notFoundTitle = 'Not found',
}: {
  error: unknown;
  onRetry?: () => void;
  notFoundTitle?: string;
}) {
  if (isStatus(error, 403)) return <PermissionDenied />;
  const display = toDisplayError(error);
  if (isStatus(error, 404)) {
    return <ErrorState title={notFoundTitle} description={display.message} />;
  }
  return (
    <ErrorState
      title="Could not load this"
      description={display.message}
      requestId={display.requestId}
      {...(onRetry ? { action: <Button onClick={onRetry}>Try again</Button> } : {})}
    />
  );
}

/** Loading → error → content, for pages whose content needs one query. */
export function QueryBoundary<T>({
  query,
  children,
  skeleton,
  notFoundTitle,
}: {
  query: { data: T | undefined; error: unknown; isPending: boolean; refetch: () => unknown };
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
  notFoundTitle?: string;
}) {
  if (query.isPending) return <>{skeleton ?? <PageSkeleton />}</>;
  if (query.error || query.data === undefined) {
    return (
      <ApiErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        {...(notFoundTitle ? { notFoundTitle } : {})}
      />
    );
  }
  return <>{children(query.data)}</>;
}
