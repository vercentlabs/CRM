// Menu configuration for role-based navigation
// Role IDs: 1 = Admin, 2 = Manager, 3 = Sales

// Import role constants
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from './constants';

// Define all menu items with their allowed roles
const menuItems = [
  {
    label: 'Dashboard',
    route: '/dashboard',
    icon: 'home',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] // All roles can access
  },
  {
    label: 'Customers',
    route: '/customers',
    icon: 'users',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] // All roles can access
  },
  {
    label: 'Leads',
    route: '/leads',
    icon: 'lightbulb',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] // All roles can access
  },
  {
    label: 'Opportunities',
    route: '/opportunities',
    icon: 'briefcase',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] // All roles can access
  },
  {
    label: 'Tasks',
    route: '/tasks',
    icon: 'check-circle',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] // All roles can access
  },
  {
    label: 'Notes',
    route: '/notes',
    icon: 'file-text',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] // All roles can access
  },
  {
    label: 'Follow-ups',
    route: '/followups',
    icon: 'calendar',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] // All roles can access
  },
  {
    label: 'Overdue Follow-ups',
    route: '/followups/overdue',
    icon: 'calendar',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER] // Admin and Manager only
  },
  {
    label: 'Chat',
    route: '/chat',
    icon: 'chat',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] // All roles can access
  },
  {
    label: 'Calendar',
    route: '/calendar',
    icon: 'calendar',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] // All roles can access
  },
  {
    label: 'Reports',
    route: '/reports',
    icon: 'chart-bar',
    allowedRoles: [ROLE_ADMIN, ROLE_MANAGER] // Admin and Manager only
  },
  {
    label: 'Settings',
    route: '/settings',
    icon: 'cog',
    allowedRoles: [ROLE_ADMIN] // Admin only
  },
  {
    label: 'Team Management',
    route: '/users',
    icon: 'users',
    allowedRoles: [ROLE_ADMIN] // Admin only
  },
  {
    label: 'System Administration',
    route: '/admin',
    icon: 'server',
    allowedRoles: [ROLE_ADMIN] // Admin only
  }
];

// Group menu items by category for better organization
const menuCategories = [
  {
    label: 'Main',
    items: menuItems.filter(item =>
      ['/dashboard', '/customers', '/leads'].includes(item.route)
    )
  },
  {
    label: 'Productivity',
    items: menuItems.filter(item =>
      ['/tasks', '/notes', '/followups', '/calendar', '/chat', '/opportunities'].includes(item.route)
    )
  },
  {
    label: 'Management',
    items: menuItems.filter(item =>
      ['/followups/overdue', '/reports', '/team'].includes(item.route)
    )
  },
  {
    label: 'Administration',
    items: menuItems.filter(item =>
      ['/users', '/settings', '/admin'].includes(item.route)
    )
  }
];

// Function to get menu items filtered by user role
export const getMenuItemsByRole = (roleId) => {
  return menuCategories.map(category => ({
    ...category,
    items: category.items.filter(item => item.allowedRoles.includes(roleId))
  })).filter(category => category.items.length > 0);
};

// Export the raw menu items and categories for other uses
export { menuItems, menuCategories };

export default menuCategories;
