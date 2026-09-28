/**
 * Record scopes answer "on which records?" once a permission answers "may I?".
 *
 * - `own`: records the member owns (per-resource rule, e.g. `assigned_to = me`).
 * - `organization`: every record in the active organization.
 *
 * TEAM scope is intentionally not implemented: the CRM has no reliable team
 * relationship yet (sales_locations.manager_id is not used for visibility).
 * It will be added together with a real teams model; until then unknown scopes
 * resolve to the most restrictive one.
 */
export const RECORD_SCOPES = ['own', 'organization'] as const;
export type RecordScope = (typeof RECORD_SCOPES)[number];

export const SCOPE_RANK: Record<RecordScope, number> = { own: 1, organization: 2 };

export function isRecordScope(value: unknown): value is RecordScope {
  return value === 'own' || value === 'organization';
}

/** Fail closed: anything unrecognised is treated as `own`. */
export function normalizeScope(value: unknown): RecordScope {
  return value === 'organization' ? 'organization' : 'own';
}

/** True when `granted` covers at least `required`. */
export function scopeCovers(granted: RecordScope, required: RecordScope): boolean {
  return SCOPE_RANK[granted] >= SCOPE_RANK[required];
}
