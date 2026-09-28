/**
 * Canonical permission names, formatted `<resource>:<action>`.
 *
 * Phase 1 only defines the vocabulary. Enforcement still uses legacy role IDs
 * (see `LEGACY_ROLE_IDS`); Phase 2 maps memberships/roles to these permissions
 * and enforces them server-side. UI checks are never a security boundary.
 */
export const PERMISSIONS = {
  users: ['users:read', 'users:create', 'users:update', 'users:deactivate'],
  leads: [
    'leads:read',
    'leads:create',
    'leads:update',
    'leads:delete',
    'leads:assign',
    'leads:export',
  ],
  customers: ['customers:read', 'customers:create', 'customers:update', 'customers:delete'],
  opportunities: [
    'opportunities:read',
    'opportunities:create',
    'opportunities:update',
    'opportunities:delete',
    'opportunities:assign',
  ],
  tasks: ['tasks:read', 'tasks:create', 'tasks:update', 'tasks:delete'],
  followups: ['followups:read', 'followups:create', 'followups:update'],
  notes: ['notes:read', 'notes:create', 'notes:update', 'notes:delete'],
  calls: ['calls:read', 'calls:create'],
  calendar: ['calendar:read', 'calendar:create', 'calendar:update', 'calendar:delete'],
  messages: ['messages:read', 'messages:send', 'messages:send_bulk'],
  chat: ['chat:read', 'chat:send'],
  reports: ['reports:read', 'reports:export'],
  locations: ['locations:read', 'locations:manage', 'locations:update_own'],
  settings: ['settings:read', 'settings:update'],
  audit: ['audit:read'],
  uploads: ['uploads:create'],
} as const;

export type PermissionResource = keyof typeof PERMISSIONS;
export type Permission = (typeof PERMISSIONS)[PermissionResource][number];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS).flat();

const permissionSet: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && permissionSet.has(value);
}

type Grants = Iterable<Permission> | ReadonlySet<Permission>;

function toSet(granted: Grants): ReadonlySet<Permission> {
  return granted instanceof Set ? granted : new Set(granted);
}

export function hasPermission(granted: Grants, required: Permission): boolean {
  return toSet(granted).has(required);
}

export function hasAllPermissions(granted: Grants, required: readonly Permission[]): boolean {
  const set = toSet(granted);
  return required.every((permission) => set.has(permission));
}

export function hasAnyPermission(granted: Grants, required: readonly Permission[]): boolean {
  const set = toSet(granted);
  return required.some((permission) => set.has(permission));
}
