import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  BUILT_IN_ROLES,
  BUILT_IN_ROLE_KEYS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  coversGrants,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isPermission,
  normalizeScope,
  scopeCovers,
  scopeOf,
  type GrantMap,
  type Permission,
} from './index.js';

const grantMap = (key: (typeof BUILT_IN_ROLE_KEYS)[number]): GrantMap =>
  new Map(Object.entries(BUILT_IN_ROLES[key].grants)) as GrantMap;

describe('permission vocabulary', () => {
  it('uses stable dotted names and has a description for each', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(permission).toMatch(/^(crm|settings)\.[a-z]+\.[a-z]+$/);
      expect(PERMISSION_DESCRIPTIONS[permission]).toBeTruthy();
    }
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    expect(Object.keys(PERMISSION_DESCRIPTIONS).sort()).toEqual([...ALL_PERMISSIONS].sort());
    expect(PERMISSIONS.leads).toContain('crm.leads.read');
  });

  it('guards unknown values', () => {
    expect(isPermission('crm.leads.read')).toBe(true);
    expect(isPermission('leads:read')).toBe(false);
    expect(isPermission(42)).toBe(false);
  });
});

describe('built-in roles', () => {
  it('only grant known permissions with valid scopes', () => {
    for (const key of BUILT_IN_ROLE_KEYS) {
      for (const [permission, scope] of Object.entries(BUILT_IN_ROLES[key].grants)) {
        expect(isPermission(permission)).toBe(true);
        expect(['own', 'organization']).toContain(scope);
      }
    }
  });

  it('gives admin every permission organization-wide', () => {
    const admin = grantMap('admin');
    expect(admin.size).toBe(ALL_PERMISSIONS.length);
    expect([...admin.values()].every((scope) => scope === 'organization')).toBe(true);
  });

  it('keeps sales on own records and away from settings', () => {
    const sales = grantMap('sales');
    expect(scopeOf(sales, 'crm.leads.read')).toBe('own');
    expect(hasPermission(sales, 'settings.users.manage')).toBe(false);
    expect(hasPermission(sales, 'crm.customers.delete')).toBe(false);
  });

  it('lets managers see the whole organization but not manage settings', () => {
    const manager = grantMap('manager');
    expect(scopeOf(manager, 'crm.leads.read')).toBe('organization');
    expect(scopeOf(manager, 'crm.opportunities.update')).toBe('own');
    expect(hasPermission(manager, 'settings.audit.read')).toBe(false);
  });

  it('has no numeric role ids (roles are keys; Phase 5 removed the legacy 1/2/3 aliases)', () => {
    for (const key of BUILT_IN_ROLE_KEYS)
      expect(BUILT_IN_ROLES[key]).not.toHaveProperty('legacyRoleId');
  });
});

describe('grant checks', () => {
  it('evaluates permission sets', () => {
    const granted: Permission[] = ['crm.leads.read', 'crm.leads.create'];
    expect(hasPermission(granted, 'crm.leads.read')).toBe(true);
    expect(hasAllPermissions(granted, ['crm.leads.read', 'crm.leads.update'])).toBe(false);
    expect(hasAnyPermission(granted, ['crm.leads.update', 'crm.leads.create'])).toBe(true);
  });

  it('compares scopes and fails closed on unknown scopes', () => {
    expect(scopeCovers('organization', 'own')).toBe(true);
    expect(scopeCovers('own', 'organization')).toBe(false);
    expect(normalizeScope('team')).toBe('own');
    expect(normalizeScope(undefined)).toBe('own');
  });

  it('blocks privilege escalation through role assignment', () => {
    expect(coversGrants(grantMap('admin'), grantMap('manager'))).toBe(true);
    expect(coversGrants(grantMap('manager'), grantMap('admin'))).toBe(false);
    expect(coversGrants(grantMap('sales'), grantMap('manager'))).toBe(false);
  });
});
