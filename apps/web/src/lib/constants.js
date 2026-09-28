import { LEGACY_ROLE_IDS } from '@crm/permissions';

// Role Constants - role IDs come from the shared @crm/permissions package
export const ROLE_ADMIN = LEGACY_ROLE_IDS.ADMIN;
export const ROLE_MANAGER = LEGACY_ROLE_IDS.MANAGER;
export const ROLE_SALES = LEGACY_ROLE_IDS.SALES;

// Role Names for display
export const ROLE_NAMES = {
  [ROLE_ADMIN]: 'Administrator',
  [ROLE_MANAGER]: 'Manager',
  [ROLE_SALES]: 'Sales Representative'
};

// Role Colors for badges
export const ROLE_COLORS = {
  [ROLE_ADMIN]: 'bg-red-100 text-red-800',
  [ROLE_MANAGER]: 'bg-blue-100 text-blue-800',
  [ROLE_SALES]: 'bg-green-100 text-green-800'
};

// Lead Statuses - Must match backend
export const LEAD_STATUSES = [
  { id: 1, name: 'New', color: 'blue' },
  { id: 2, name: 'Contacted', color: 'purple' },
  { id: 3, name: 'Qualified', color: 'green' },
  { id: 4, name: 'Converted', color: 'emerald' },
  { id: 5, name: 'Lost', color: 'red' }
];

// Follow-up Types - Must match backend
export const FOLLOWUP_TYPES = [
  { id: 1, name: 'Phone Call', icon: 'phone' },
  { id: 2, name: 'Email', icon: 'mail' },
  { id: 3, name: 'Meeting', icon: 'calendar' },
  { id: 4, name: 'Demo', icon: 'monitor' },
  { id: 5, name: 'Follow-up', icon: 'refresh-cw' },
  { id: 6, name: 'Task', icon: 'check-square' },
  { id: 7, name: 'Note', icon: 'file-text' }
];

// Priority Levels
export const PRIORITY_LEVELS = [
  { id: 1, name: 'Low', color: 'gray' },
  { id: 2, name: 'Medium', color: 'blue' },
  { id: 3, name: 'High', color: 'orange' },
  { id: 4, name: 'Urgent', color: 'red' }
];

// Helper functions
export const getRoleName = (roleId) => {
  return ROLE_NAMES[roleId] || 'Unknown';
};

export const getLeadStatus = (statusId) => {
  return LEAD_STATUSES.find(status => status.id === statusId) || { name: 'Unknown', color: 'gray' };
};

export const getFollowupType = (typeId) => {
  return FOLLOWUP_TYPES.find(type => type.id === typeId) || { name: 'Unknown', icon: 'help-circle' };
};

export const getPriorityLevel = (priorityId) => {
  return PRIORITY_LEVELS.find(priority => priority.id === priorityId) || { name: 'Unknown', color: 'gray' };
};
