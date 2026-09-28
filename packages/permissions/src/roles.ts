/**
 * Role IDs currently stored in `users.role_id` and embedded in JWTs.
 * They are duplicated today in apps/api (middleware/roleCheck.js),
 * apps/web (lib/constants.js) and apps/mobile (config/constants.ts).
 * Phase 2 replaces global roles with organization memberships.
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
