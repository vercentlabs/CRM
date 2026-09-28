import type { Permission } from './permissions.js';
import type { RecordScope } from './scopes.js';

/**
 * Client-side (UI-only) checks over the session's permission map
 * (`AuthSessionView.permissions`: permission → record scope). Web and mobile
 * use these to decide what to show; the API enforces every permission.
 */
export type SessionPermissions = Partial<Record<string, RecordScope>>;

export const canIn = (
  permissions: SessionPermissions | null | undefined,
  permission: Permission,
): boolean => Boolean(permissions?.[permission]);

export const canAnyIn = (
  permissions: SessionPermissions | null | undefined,
  list: readonly Permission[],
): boolean => list.some((permission) => canIn(permissions, permission));

export const scopeIn = (
  permissions: SessionPermissions | null | undefined,
  permission: Permission,
): RecordScope | null => permissions?.[permission] ?? null;

/** Organization-wide grant (e.g. may pick any member as assignee, sees team reports). */
export const canOrgIn = (
  permissions: SessionPermissions | null | undefined,
  permission: Permission,
): boolean => scopeIn(permissions, permission) === 'organization';
