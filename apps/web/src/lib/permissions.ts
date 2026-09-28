/**
 * UI-only permission checks over the session's `permissions` map, shared with
 * the mobile app through @crm/permissions. They decide what to *show*; the
 * API enforces every permission and scope on the server.
 */
export {
  canIn as can,
  canAnyIn as canAny,
  canOrgIn as canOrg,
  scopeIn as scopeOf,
  type SessionPermissions as PermissionMap,
} from '@crm/permissions';
