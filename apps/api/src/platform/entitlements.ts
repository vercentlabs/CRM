import type { Queryable } from '@crm/database';
import {
  getLimit,
  isFeatureEnabled,
  resolveEntitlements,
  withinLimit,
  type Entitlements,
  type EntitlementRow,
  type FeatureKey,
  type LimitKey,
} from '@crm/entitlements';
import { pool } from './db.js';
import { AppError } from './http/errors.js';

/**
 * Organization entitlements (what the plan enables), resolved server-side and
 * never carried in tokens. Reads use a short in-process cache; checks that
 * guard a write (seats) re-read inside the caller's transaction instead.
 *
 * Subscription rule: an 'active' or 'trialing' subscription uses its plan;
 * any other state (or none) falls back to the default plan, so a lapsed or
 * missing subscription never locks an organization out without a product
 * decision.
 */

const CACHE_TTL_MS = 30_000;
const cache = new Map<number, { value: Entitlements; expires: number }>();

export async function loadEntitlements(
  db: Queryable,
  organizationId: number,
): Promise<Entitlements> {
  const result = await db.query(
    `WITH chosen AS (
       SELECT COALESCE(
                (SELECT s.plan_id FROM subscriptions s
                  WHERE s.organization_id = $1 AND s.status IN ('active', 'trialing')),
                (SELECT id FROM plans WHERE is_default)) AS plan_id,
              COALESCE((SELECT status FROM subscriptions WHERE organization_id = $1), 'none') AS status
     )
     SELECT p.key AS plan_key, p.name AS plan_name, chosen.status,
            COALESCE(json_agg(json_build_object('key', pe.key, 'enabled', pe.enabled,
                                                'limit_value', pe.limit_value))
                     FILTER (WHERE pe.key IS NOT NULL), '[]'::json) AS rows
     FROM chosen
     JOIN plans p ON p.id = chosen.plan_id
     LEFT JOIN plan_entitlements pe ON pe.plan_id = p.id
     GROUP BY p.key, p.name, chosen.status`,
    [organizationId],
  );
  const row = result.rows[0] as
    { plan_key: string; plan_name: string; status: string; rows: EntitlementRow[] } | undefined;
  if (!row) throw new Error('No default plan is configured');
  return resolveEntitlements({ key: row.plan_key, name: row.plan_name }, row.status, row.rows);
}

export async function getEntitlements(organizationId: number): Promise<Entitlements> {
  const hit = cache.get(organizationId);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await loadEntitlements(pool, organizationId);
  cache.set(organizationId, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Test/admin seam: forget cached entitlements (e.g. after a plan change). */
export function invalidateEntitlements(organizationId?: number): void {
  if (organizationId === undefined) cache.clear();
  else cache.delete(organizationId);
}

export async function requireFeature(
  tenant: { organizationId: number },
  feature: FeatureKey,
): Promise<void> {
  if (!isFeatureEnabled(await getEntitlements(tenant.organizationId), feature)) {
    throw new AppError(
      'FEATURE_NOT_ENABLED',
      "Your organization's plan does not include this feature",
    );
  }
}

export const planLimitReached = (message: string) => new AppError('PLAN_LIMIT_REACHED', message);

/** Active members consume seats; invited and suspended memberships do not. */
export async function countActiveSeats(db: Queryable, organizationId: number): Promise<number> {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count FROM organization_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = $1 AND m.status = 'active' AND COALESCE(u.is_active, true)`,
    [organizationId],
  );
  return (result.rows[0] as { count: number }).count;
}

/**
 * Seat check for a membership that is about to become active. Must run inside
 * the transaction that activates it: the organization row lock serializes
 * concurrent activations so two requests cannot both take the last seat.
 */
export async function assertSeatAvailable(tx: Queryable, organizationId: number): Promise<void> {
  await tx.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [organizationId]);
  const limit = getLimit(await loadEntitlements(tx, organizationId), 'seats');
  if (!withinLimit(limit, await countActiveSeats(tx, organizationId))) {
    throw planLimitReached(
      `Your plan allows ${limit} active member${limit === 1 ? '' : 's'}. Suspend a member or change the plan to add more.`,
    );
  }
}

/** Numeric limit check against a usage counter (e.g. stored bytes). */
export async function assertWithinLimit(
  tx: Queryable,
  organizationId: number,
  limit: LimitKey,
  current: number,
  adding: number,
  message: string,
): Promise<void> {
  const value = getLimit(await loadEntitlements(tx, organizationId), limit);
  if (!withinLimit(value, current, adding)) throw planLimitReached(message);
}
