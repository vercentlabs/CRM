import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '../config/constants';

export type MenuTarget =
  | { type: 'tab'; name: 'Dashboard' | 'Leads' | 'Chat' | 'Notes' }
  | { type: 'screen'; name: string };

export type MenuItem = {
  label: string;
  icon: string;
  target: MenuTarget;
  roles: number[];
};

export type MenuCategory = {
  label: string;
  items: MenuItem[];
};

const menuItems: MenuItem[] = [
  {
    label: 'Dashboard',
    icon: 'home',
    target: { type: 'tab', name: 'Dashboard' },
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    label: 'Customers',
    icon: 'users',
    target: { type: 'screen', name: 'Customers' },
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    label: 'Leads',
    icon: 'user-plus',
    target: { type: 'tab', name: 'Leads' },
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    label: 'Opportunities',
    icon: 'briefcase',
    target: { type: 'screen', name: 'Opportunities' },
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    label: 'Tasks',
    icon: 'check-circle',
    target: { type: 'screen', name: 'Tasks' },
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    label: 'Notes',
    icon: 'file-text',
    target: { type: 'tab', name: 'Notes' },
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    label: 'Follow-ups',
    icon: 'calendar',
    target: { type: 'screen', name: 'Followups' },
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    label: 'Overdue Follow-ups',
    icon: 'alert-circle',
    target: { type: 'screen', name: 'OverdueFollowups' },
    roles: [ROLE_ADMIN, ROLE_MANAGER]
  },
  {
    label: 'Chat',
    icon: 'message-circle',
    target: { type: 'tab', name: 'Chat' },
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    label: 'AI Agent',
    icon: 'cpu',
    target: { type: 'screen', name: 'AIAgent' },
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    label: 'Calls',
    icon: 'phone',
    target: { type: 'screen', name: 'Calls' },
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    label: 'Lead Messages',
    icon: 'message-square',
    target: { type: 'screen', name: 'LeadMessages' },
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    label: 'Calendar',
    icon: 'calendar',
    target: { type: 'screen', name: 'Calendar' },
    roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]
  },
  {
    label: 'Reports',
    icon: 'bar-chart-2',
    target: { type: 'screen', name: 'Reports' },
    roles: [ROLE_ADMIN, ROLE_MANAGER]
  },
  {
    label: 'Audit Logs',
    icon: 'activity',
    target: { type: 'screen', name: 'AuditLogs' },
    roles: [ROLE_ADMIN]
  },
  {
    label: 'Locations',
    icon: 'map-pin',
    target: { type: 'screen', name: 'Locations' },
    roles: [ROLE_ADMIN, ROLE_MANAGER]
  },
  {
    label: 'Settings',
    icon: 'settings',
    target: { type: 'screen', name: 'Settings' },
    roles: [ROLE_ADMIN]
  },
  {
    label: 'Team Management',
    icon: 'users',
    target: { type: 'screen', name: 'Users' },
    roles: [ROLE_ADMIN]
  },
  {
    label: 'System Administration',
    icon: 'server',
    target: { type: 'screen', name: 'Admin' },
    roles: [ROLE_ADMIN]
  }
];

const menuCategories: MenuCategory[] = [
  {
    label: 'Main',
    items: menuItems.filter((item) =>
      ['Dashboard', 'Customers', 'Leads'].includes(item.label)
    )
  },
  {
    label: 'Productivity',
    items: menuItems.filter((item) =>
      [
        'Tasks',
        'Notes',
        'Follow-ups',
        'Calendar',
        'Chat',
        'AI Agent',
        'Opportunities',
        'Calls',
        'Lead Messages'
      ].includes(
        item.label
      )
    )
  },
  {
    label: 'Management',
    items: menuItems.filter((item) =>
      ['Overdue Follow-ups', 'Reports', 'Locations'].includes(item.label)
    )
  },
  {
    label: 'Administration',
    items: menuItems.filter((item) =>
      ['Team Management', 'Settings', 'System Administration', 'Audit Logs'].includes(item.label)
    )
  }
];

export const getMenuCategoriesForRole = (roleId?: number | null) => {
  if (!roleId) return [];
  return menuCategories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => item.roles.includes(roleId))
    }))
    .filter((category) => category.items.length > 0);
};

export default menuCategories;
