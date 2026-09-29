import type { Permission } from '@crm/permissions';
import {
  BriefcaseIcon,
  BuildingIcon,
  CalendarIcon,
  ChartIcon,
  ChatIcon,
  CheckSquareIcon,
  ClockIcon,
  HomeIcon,
  LeadIcon,
  MapPinIcon,
  MessageIcon,
  NoteIcon,
  PhoneIcon,
  SettingsIcon,
  UsersIcon,
} from '@crm/ui';
import type { ComponentType, SVGProps } from 'react';

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Shown when the session holds any of these (none = every member). */
  anyOf?: Permission[];
  /** Extra words for the quick-navigation palette. */
  keywords?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** The single navigation definition (sidebar, mobile drawer, quick navigation). */
export const NAVIGATION: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: HomeIcon, keywords: 'home overview today' },
      {
        label: 'Leads',
        href: '/leads',
        icon: LeadIcon,
        anyOf: ['crm.leads.read'],
        keywords: 'prospects pipeline',
      },
      {
        label: 'Follow-ups',
        href: '/followups',
        icon: ClockIcon,
        anyOf: ['crm.followups.read'],
        keywords: 'calls schedule overdue',
      },
      {
        label: 'Tasks',
        href: '/tasks',
        icon: CheckSquareIcon,
        anyOf: ['crm.tasks.read'],
        keywords: 'todo',
      },
      {
        label: 'Calendar',
        href: '/calendar',
        icon: CalendarIcon,
        anyOf: ['crm.tasks.read'],
        keywords: 'events schedule',
      },
    ],
  },
  {
    label: 'Sales',
    items: [
      {
        label: 'Customers',
        href: '/customers',
        icon: BuildingIcon,
        anyOf: ['crm.customers.read'],
        keywords: 'accounts clients',
      },
      {
        label: 'Opportunities',
        href: '/opportunities',
        icon: BriefcaseIcon,
        anyOf: ['crm.opportunities.read'],
        keywords: 'deals pipeline',
      },
      { label: 'Notes', href: '/notes', icon: NoteIcon, anyOf: ['crm.notes.read'] },
    ],
  },
  {
    label: 'Communication',
    items: [
      {
        label: 'Calls',
        href: '/calls',
        icon: PhoneIcon,
        anyOf: ['crm.calls.read'],
        keywords: 'phone log',
      },
      {
        label: 'Lead messages',
        href: '/messages',
        icon: MessageIcon,
        anyOf: ['crm.messages.read', 'crm.messages.send'],
        keywords: 'sms whatsapp bulk',
      },
      {
        label: 'Team chat',
        href: '/chat',
        icon: ChatIcon,
        anyOf: ['crm.chat.use'],
        keywords: 'conversations',
      },
    ],
  },
  {
    label: 'Insights',
    items: [
      {
        label: 'Reports',
        href: '/reports',
        icon: ChartIcon,
        anyOf: ['crm.reports.read'],
        keywords: 'analytics conversion aging performance',
      },
      {
        label: 'Locations',
        href: '/locations',
        icon: MapPinIcon,
        anyOf: ['crm.locations.read', 'crm.locations.checkin'],
        keywords: 'branches check-in field',
      },
    ],
  },
  {
    label: 'Organization',
    items: [
      {
        label: 'Members',
        href: '/settings/members',
        icon: UsersIcon,
        anyOf: ['settings.users.read'],
        keywords: 'team users roles invite',
      },
      {
        label: 'Settings',
        href: '/settings',
        icon: SettingsIcon,
        anyOf: [
          'settings.organization.manage',
          'settings.audit.read',
          'settings.integrations.manage',
        ],
        keywords: 'organization preferences audit log',
      },
    ],
  },
];

export function visibleNavigation(canAny: (...permissions: Permission[]) => boolean): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.anyOf || canAny(...item.anyOf)),
  })).filter((group) => group.items.length > 0);
}

/** The nav item that owns a path (longest matching prefix). */
export function activeHref(pathname: string, groups: NavGroup[]): string | null {
  let best: string | null = null;
  for (const item of groups.flatMap((group) => group.items)) {
    if (
      (pathname === item.href || pathname.startsWith(`${item.href}/`)) &&
      item.href.length > (best?.length ?? 0)
    ) {
      best = item.href;
    }
  }
  return best;
}
