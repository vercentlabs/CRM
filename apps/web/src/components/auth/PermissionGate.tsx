'use client';

import type { Permission } from '@crm/permissions';
import { PermissionDenied } from '@crm/ui';
import type { ReactNode } from 'react';
import { useSession } from '@/providers/SessionProvider';

/**
 * Renders children only when the session holds the permission (any of `anyOf`).
 * UX only: the API authorizes every request regardless of what is shown.
 */
export function PermissionGate({
  permission,
  anyOf,
  children,
  fallback = null,
}: {
  permission?: Permission;
  anyOf?: Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const session = useSession();
  const allowed =
    (permission === undefined || session.can(permission)) &&
    (anyOf === undefined || session.canAny(...anyOf));
  return <>{allowed ? children : fallback}</>;
}

/** Page-level gate: shows a permission-denied panel instead of the page. */
export function RequirePermission({
  permission,
  anyOf,
  children,
}: {
  permission?: Permission;
  anyOf?: Permission[];
  children: ReactNode;
}) {
  return (
    <PermissionGate
      {...(permission ? { permission } : {})}
      {...(anyOf ? { anyOf } : {})}
      fallback={<PermissionDenied />}
    >
      {children}
    </PermissionGate>
  );
}
