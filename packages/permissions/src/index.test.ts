import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  LEGACY_ROLE_IDS,
  PERMISSIONS,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isLegacyRoleId,
  isPermission,
} from './index.js';

describe('permissions', () => {
  it('names every permission <resource>:<action> under its own resource', () => {
    for (const [resource, permissions] of Object.entries(PERMISSIONS)) {
      for (const permission of permissions) {
        expect(permission).toMatch(new RegExp(`^${resource}:[a-z_]+$`));
      }
    }
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('checks grants', () => {
    const granted = ['leads:read', 'leads:create'] as const;
    expect(hasPermission(granted, 'leads:read')).toBe(true);
    expect(hasPermission(granted, 'leads:delete')).toBe(false);
    expect(hasAllPermissions(granted, ['leads:read', 'leads:create'])).toBe(true);
    expect(hasAllPermissions(granted, ['leads:read', 'leads:delete'])).toBe(false);
    expect(hasAnyPermission(granted, ['leads:delete', 'leads:read'])).toBe(true);
    expect(hasAnyPermission(new Set(), ['leads:read'])).toBe(false);
  });

  it('guards unknown values', () => {
    expect(isPermission('leads:read')).toBe(true);
    expect(isPermission('leads:fly')).toBe(false);
    expect(isPermission(42)).toBe(false);
  });

  it('keeps legacy role ids stable', () => {
    expect(LEGACY_ROLE_IDS).toEqual({ ADMIN: 1, MANAGER: 2, SALES: 3 });
    expect(isLegacyRoleId(2)).toBe(true);
    expect(isLegacyRoleId(4)).toBe(false);
  });
});
