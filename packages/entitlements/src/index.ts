/**
 * Organization entitlements: what the organization's plan enables, independent
 * of what a member's role permits. Both checks may apply to one operation:
 *
 *   permission  — may this member perform the operation?      (@crm/permissions)
 *   entitlement — has this organization enabled the capability? (this package)
 *
 * Keys describe capabilities that exist today. Plans are data (plans /
 * plan_entitlements tables); code never compares plan names.
 */

export const FEATURE_KEYS = ['reports.export', 'messages.bulk', 'files.upload'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const LIMIT_KEYS = ['seats', 'storage.bytes'] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export type EntitlementKey = FeatureKey | LimitKey;

export const FEATURE_DESCRIPTIONS: Record<FeatureKey, string> = {
  'reports.export': 'Export leads as CSV',
  'messages.bulk': 'Send one message to many leads',
  'files.upload': 'Upload chat attachments',
};

export const LIMIT_DESCRIPTIONS: Record<LimitKey, string> = {
  seats: 'Active members of the organization',
  'storage.bytes': 'Bytes of uploaded files currently stored',
};

export interface EntitlementRow {
  key: string;
  enabled: boolean;
  limit_value: number | string | null;
}

export interface Entitlements {
  plan: { key: string; name: string };
  subscriptionStatus: string;
  features: Record<FeatureKey, boolean>;
  /** null = unlimited. */
  limits: Record<LimitKey, number | null>;
}

export const isFeatureKey = (key: string): key is FeatureKey =>
  (FEATURE_KEYS as readonly string[]).includes(key);
export const isLimitKey = (key: string): key is LimitKey =>
  (LIMIT_KEYS as readonly string[]).includes(key);

/**
 * Builds the entitlement view from a plan's rows. A feature missing from the
 * plan is disabled (fail closed); a limit row that is disabled means "none
 * allowed" (0); an enabled limit without a value is unlimited. Unknown keys
 * in the database are ignored.
 */
export function resolveEntitlements(
  plan: { key: string; name: string },
  subscriptionStatus: string,
  rows: readonly EntitlementRow[],
): Entitlements {
  const features = Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])) as Record<
    FeatureKey,
    boolean
  >;
  const limits = Object.fromEntries(LIMIT_KEYS.map((k) => [k, 0])) as Record<
    LimitKey,
    number | null
  >;
  for (const row of rows) {
    if (isFeatureKey(row.key)) features[row.key] = row.enabled;
    else if (isLimitKey(row.key)) {
      limits[row.key] = !row.enabled
        ? 0
        : row.limit_value === null
          ? null
          : Number(row.limit_value);
    }
  }
  return { plan, subscriptionStatus, features, limits };
}

export const isFeatureEnabled = (entitlements: Entitlements, feature: FeatureKey) =>
  entitlements.features[feature];

export const getLimit = (entitlements: Entitlements, limit: LimitKey) => entitlements.limits[limit];

/** True when `current + adding` stays within the limit (null = unlimited). */
export function withinLimit(limit: number | null, current: number, adding = 1): boolean {
  return limit === null || current + adding <= limit;
}
