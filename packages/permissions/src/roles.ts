import { ALL_PERMISSIONS, type Permission } from './permissions.js';
import type { RecordScope } from './scopes.js';

/**
 * Built-in role templates. They are global rows in `roles` (organization_id
 * NULL, is_system = true) that every organization can assign; organizations
 * may later add their own roles (organization_id set) without code changes.
 * Authorization always goes through the role's permission grants, never the
 * role key or id.
 */
export const BUILT_IN_ROLE_KEYS = ['admin', 'manager', 'sales'] as const;
export type BuiltInRoleKey = (typeof BUILT_IN_ROLE_KEYS)[number];

export type PermissionGrants = Partial<Record<Permission, RecordScope>>;

const org = 'organization' as const;
const own = 'own' as const;

const adminGrants: PermissionGrants = Object.fromEntries(
  ALL_PERMISSIONS.map((permission) => [permission, org]),
);

export const BUILT_IN_ROLES: Record<
  BuiltInRoleKey,
  { name: string; description: string; legacyRoleId: 1 | 2 | 3; grants: PermissionGrants }
> = {
  admin: {
    name: 'Admin',
    description: 'Full access to the organization',
    legacyRoleId: 1,
    grants: adminGrants,
  },
  manager: {
    name: 'Manager',
    description: 'Organization-wide CRM access and reports',
    legacyRoleId: 2,
    grants: {
      'crm.leads.read': org,
      'crm.leads.create': org,
      'crm.leads.update': org,
      'crm.leads.assign': org,
      'crm.customers.read': org,
      'crm.customers.create': org,
      'crm.customers.update': org,
      'crm.opportunities.read': org,
      'crm.opportunities.create': org,
      // Pre-Phase-2 rule kept: managers may only edit opportunities assigned to them.
      'crm.opportunities.update': own,
      'crm.opportunities.assign': org,
      'crm.followups.read': org,
      'crm.tasks.read': org,
      'crm.tasks.create': org,
      'crm.tasks.update': org,
      'crm.tasks.delete': org,
      'crm.notes.read': org,
      'crm.notes.create': org,
      'crm.notes.update': org,
      'crm.notes.delete': org,
      'crm.calls.read': org,
      'crm.calls.create': org,
      'crm.messages.read': org,
      'crm.messages.send': org,
      'crm.messages.update': org,
      'crm.chat.use': org,
      'crm.reports.read': org,
      'crm.reports.export': org,
      'crm.locations.read': org,
      'settings.users.read': org,
    },
  },
  sales: {
    name: 'Sales',
    description: 'Works own leads, customers and opportunities',
    legacyRoleId: 3,
    grants: {
      'crm.leads.read': own,
      'crm.leads.create': own,
      'crm.leads.update': own,
      'crm.customers.read': own,
      'crm.customers.create': own,
      'crm.customers.update': own,
      'crm.opportunities.read': own,
      'crm.opportunities.create': own,
      'crm.opportunities.update': own,
      'crm.followups.read': own,
      'crm.followups.create': own,
      'crm.followups.update': own,
      'crm.tasks.read': own,
      'crm.tasks.create': own,
      'crm.tasks.update': own,
      'crm.notes.read': own,
      'crm.notes.create': own,
      'crm.notes.update': own,
      'crm.notes.delete': own,
      'crm.calls.read': own,
      'crm.calls.create': own,
      'crm.calls.update': own,
      'crm.messages.read': own,
      'crm.messages.send': own,
      'crm.messages.update': own,
      'crm.chat.use': org,
      'crm.reports.read': own,
      'crm.reports.export': own,
      'crm.locations.checkin': own,
    },
  },
};

export function isBuiltInRoleKey(value: unknown): value is BuiltInRoleKey {
  return typeof value === 'string' && (BUILT_IN_ROLE_KEYS as readonly string[]).includes(value);
}

/**
 * DEPRECATED numeric role ids (1 Admin, 2 Manager, 3 Sales) from `users.role_id`.
 * Kept only so legacy clients can keep rendering role-dependent UI from the
 * `roleId` field in API responses. Never use them for authorization.
 */
export const LEGACY_ROLE_IDS = {
  ADMIN: 1,
  MANAGER: 2,
  SALES: 3,
} as const;

export type LegacyRoleName = keyof typeof LEGACY_ROLE_IDS;
export type LegacyRoleId = (typeof LEGACY_ROLE_IDS)[LegacyRoleName];

export function isLegacyRoleId(value: unknown): value is LegacyRoleId {
  return Object.values(LEGACY_ROLE_IDS).includes(value as LegacyRoleId);
}

export function builtInRoleKeyForLegacyId(value: unknown): BuiltInRoleKey | undefined {
  const id = typeof value === 'string' ? Number(value) : value;
  return BUILT_IN_ROLE_KEYS.find((key) => BUILT_IN_ROLES[key].legacyRoleId === id);
}
