import type { Permission } from '@crm/permissions';
import type { IconName } from '../components/ui';
import type { DrawerParamList } from './types';

export interface MenuItem {
  route: keyof DrawerParamList;
  label: string;
  icon: IconName;
  /** Visible when the session holds any of these (none = every member). UX only. */
  anyOf?: Permission[];
}

export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

/** The single navigation definition: drawer entries and registered screens. */
export const MENU: MenuGroup[] = [
  {
    label: 'Work',
    items: [
      { route: 'Home', label: 'Home', icon: 'home' },
      { route: 'Notifications', label: 'Notifications', icon: 'bell' },
      { route: 'Tasks', label: 'Tasks', icon: 'check-square', anyOf: ['crm.tasks.read'] },
      { route: 'Calendar', label: 'Calendar', icon: 'calendar', anyOf: ['crm.tasks.read'] },
      { route: 'Followups', label: 'Follow-ups', icon: 'clock', anyOf: ['crm.followups.read'] },
    ],
  },
  {
    label: 'CRM',
    items: [
      { route: 'Leads', label: 'Leads', icon: 'user-plus', anyOf: ['crm.leads.read'] },
      { route: 'Customers', label: 'Customers', icon: 'briefcase', anyOf: ['crm.customers.read'] },
      {
        route: 'Opportunities',
        label: 'Opportunities',
        icon: 'trending-up',
        anyOf: ['crm.opportunities.read'],
      },
      { route: 'Notes', label: 'Notes', icon: 'file-text', anyOf: ['crm.notes.read'] },
    ],
  },
  {
    label: 'Communication',
    items: [
      { route: 'Calls', label: 'Calls', icon: 'phone', anyOf: ['crm.calls.read'] },
      {
        route: 'Messages',
        label: 'Lead messages',
        icon: 'message-square',
        anyOf: ['crm.messages.read', 'crm.messages.send'],
      },
      { route: 'Chat', label: 'Team chat', icon: 'message-circle', anyOf: ['crm.chat.use'] },
    ],
  },
  {
    label: 'Insights',
    items: [
      { route: 'Reports', label: 'Reports', icon: 'bar-chart-2', anyOf: ['crm.reports.read'] },
      {
        route: 'Locations',
        label: 'Locations',
        icon: 'map-pin',
        anyOf: ['crm.locations.read', 'crm.locations.checkin'],
      },
    ],
  },
  {
    label: 'Organization',
    items: [
      { route: 'Members', label: 'Members', icon: 'users', anyOf: ['settings.users.read'] },
      {
        route: 'Settings',
        label: 'Settings',
        icon: 'settings',
        anyOf: ['settings.organization.manage', 'settings.audit.read'],
      },
      { route: 'Account', label: 'My account', icon: 'user' },
    ],
  },
];

export function visibleMenu(canAny: (...permissions: Permission[]) => boolean): MenuGroup[] {
  return MENU.map((group) => ({
    ...group,
    items: group.items.filter((i) => !i.anyOf || canAny(...i.anyOf)),
  })).filter((group) => group.items.length > 0);
}
