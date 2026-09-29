/**
 * Canonical permission vocabulary: `<area>.<resource>.<action>`.
 *
 * This file is the single source of truth. Migrations seed the `permissions`
 * table from it (a test asserts they match), and no application may invent
 * permission strings of its own. The server enforces permissions; clients may
 * only use them to hide UI.
 */
export const PERMISSIONS = {
  leads: ['crm.leads.read', 'crm.leads.create', 'crm.leads.update', 'crm.leads.assign'],
  customers: [
    'crm.customers.read',
    'crm.customers.create',
    'crm.customers.update',
    'crm.customers.delete',
  ],
  opportunities: [
    'crm.opportunities.read',
    'crm.opportunities.create',
    'crm.opportunities.update',
    'crm.opportunities.assign',
  ],
  followups: ['crm.followups.read', 'crm.followups.create', 'crm.followups.update'],
  tasks: ['crm.tasks.read', 'crm.tasks.create', 'crm.tasks.update', 'crm.tasks.delete'],
  notes: ['crm.notes.read', 'crm.notes.create', 'crm.notes.update', 'crm.notes.delete'],
  calls: ['crm.calls.read', 'crm.calls.create', 'crm.calls.update'],
  messages: ['crm.messages.read', 'crm.messages.send', 'crm.messages.update'],
  chat: ['crm.chat.use'],
  reports: ['crm.reports.read', 'crm.reports.export'],
  locations: ['crm.locations.read', 'crm.locations.manage', 'crm.locations.checkin'],
  users: ['settings.users.read', 'settings.users.manage'],
  organization: ['settings.organization.manage'],
  audit: ['settings.audit.read'],
  integrations: ['settings.integrations.manage'],
} as const;

export type PermissionGroup = keyof typeof PERMISSIONS;
export type Permission = (typeof PERMISSIONS)[PermissionGroup][number];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS).flat();

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'crm.leads.read': 'View leads',
  'crm.leads.create': 'Create leads',
  'crm.leads.update': 'Edit leads',
  'crm.leads.assign': 'Assign leads to other members',
  'crm.customers.read': 'View customers',
  'crm.customers.create': 'Create customers',
  'crm.customers.update': 'Edit customers',
  'crm.customers.delete': 'Delete customers',
  'crm.opportunities.read': 'View opportunities',
  'crm.opportunities.create': 'Create opportunities',
  'crm.opportunities.update': 'Edit opportunities',
  'crm.opportunities.assign': 'Assign opportunities to other members',
  'crm.followups.read': 'View follow-ups',
  'crm.followups.create': 'Schedule follow-ups',
  'crm.followups.update': 'Complete or update follow-ups',
  'crm.tasks.read': 'View tasks and calendar events',
  'crm.tasks.create': 'Create tasks and calendar events',
  'crm.tasks.update': 'Edit tasks and calendar events',
  'crm.tasks.delete': 'Delete tasks and calendar events',
  'crm.notes.read': 'View notes',
  'crm.notes.create': 'Create notes',
  'crm.notes.update': 'Edit notes',
  'crm.notes.delete': 'Delete notes',
  'crm.calls.read': 'View call logs',
  'crm.calls.create': 'Place calls',
  'crm.calls.update': 'Update or end calls',
  'crm.messages.read': 'View lead messages',
  'crm.messages.send': 'Send lead messages (single and bulk)',
  'crm.messages.update': 'Update lead message delivery status',
  'crm.chat.use': 'Use internal team chat',
  'crm.reports.read': 'View dashboards and reports',
  'crm.reports.export': 'Export report data',
  'crm.locations.read': 'View sales locations and executive locations',
  'crm.locations.manage': 'Create, edit and delete sales locations',
  'crm.locations.checkin': 'Report own current location',
  'settings.users.read': 'View organization members',
  'settings.users.manage': 'Add members, change roles and suspend members',
  'settings.organization.manage': 'Manage organization settings and diagnostics',
  'settings.audit.read': 'View the organization audit log',
  'settings.integrations.manage': 'Manage outbound webhooks and integration secrets',
};

const permissionSet: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && permissionSet.has(value);
}
