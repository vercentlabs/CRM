import type { Queryable } from '@crm/database';

/**
 * Usage counters (usage_counters): atomic upserts, always executed in the same
 * transaction as the change they measure so a rolled-back change never counts.
 * Metrics: 'storage.bytes' (lifetime, stored file bytes). Worker-side metrics
 * ('messages.sent', monthly) use the same table.
 */
export type UsageMetric = 'storage.bytes' | 'messages.sent';

export const LIFETIME = 'lifetime';
export const monthPeriod = (date = new Date()) => date.toISOString().slice(0, 7);

export async function addUsage(
  tx: Queryable,
  organizationId: number,
  metric: UsageMetric,
  delta: number,
  period = LIFETIME,
): Promise<void> {
  await tx.query(
    `INSERT INTO usage_counters (organization_id, metric, period, value, updated_at)
     VALUES ($1, $2, $3, GREATEST($4::bigint, 0), now())
     ON CONFLICT (organization_id, metric, period)
     DO UPDATE SET value = GREATEST(usage_counters.value + $4::bigint, 0), updated_at = now()`,
    [organizationId, metric, period, delta],
  );
}

/** Creates the counter if needed and locks it for the rest of the transaction. */
export async function lockUsage(
  tx: Queryable,
  organizationId: number,
  metric: UsageMetric,
  period = LIFETIME,
): Promise<number> {
  await tx.query(
    `INSERT INTO usage_counters (organization_id, metric, period, value)
     VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING`,
    [organizationId, metric, period],
  );
  return readUsage(tx, organizationId, metric, period, true);
}

export async function readUsage(
  db: Queryable,
  organizationId: number,
  metric: UsageMetric,
  period = LIFETIME,
  lock = false,
): Promise<number> {
  const result = await db.query(
    `SELECT value FROM usage_counters WHERE organization_id = $1 AND metric = $2 AND period = $3${lock ? ' FOR UPDATE' : ''}`,
    [organizationId, metric, period],
  );
  return Number((result.rows[0] as { value: string } | undefined)?.value ?? 0);
}
