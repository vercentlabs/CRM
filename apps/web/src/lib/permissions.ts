import type { Permission } from '@crm/permissions';
import type { RecordScopeName } from '@crm/types';

/**
 * UI-only permission checks over the session's `permissions` map
 * (permission → record scope). They decide what to *show*; the API enforces
 * every permission and scope on the server.
 */
export type PermissionMap = Partial<Record<string, RecordScopeName>>;

export const can = (permissions: PermissionMap | null | undefined, permission: Permission) =>
  Boolean(permissions?.[permission]);

export const canAny = (
  permissions: PermissionMap | null | undefined,
  list: readonly Permission[],
) => list.some((permission) => can(permissions, permission));

export const scopeOf = (
  permissions: PermissionMap | null | undefined,
  permission: Permission,
): RecordScopeName | null => permissions?.[permission] ?? null;

/** Organization-wide grant (e.g. can pick any member as assignee, sees team reports). */
export const canOrg = (permissions: PermissionMap | null | undefined, permission: Permission) =>
  scopeOf(permissions, permission) === 'organization';
