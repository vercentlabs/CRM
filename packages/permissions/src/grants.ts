import type { Permission } from './permissions.js';
import { scopeCovers, type RecordScope } from './scopes.js';

/** Resolved grants of the current member: permission → widest scope granted. */
export type GrantMap = ReadonlyMap<Permission, RecordScope>;

type Grants = GrantMap | Iterable<Permission>;

function toMap(granted: Grants): GrantMap {
  if (granted instanceof Map) return granted;
  return new Map(Array.from(granted as Iterable<Permission>, (p) => [p, 'organization' as const]));
}

export function hasPermission(granted: Grants, required: Permission): boolean {
  return toMap(granted).has(required);
}

export function hasAllPermissions(granted: Grants, required: readonly Permission[]): boolean {
  const map = toMap(granted);
  return required.every((permission) => map.has(permission));
}

export function hasAnyPermission(granted: Grants, required: readonly Permission[]): boolean {
  const map = toMap(granted);
  return required.some((permission) => map.has(permission));
}

export function scopeOf(granted: GrantMap, permission: Permission): RecordScope | null {
  return granted.get(permission) ?? null;
}

/**
 * Privilege-escalation guard: an actor may only grant a role whose every
 * permission (and scope) they already hold themselves.
 */
export function coversGrants(actor: GrantMap, target: GrantMap): boolean {
  for (const [permission, scope] of target) {
    const held = actor.get(permission);
    if (!held || !scopeCovers(held, scope)) return false;
  }
  return true;
}
