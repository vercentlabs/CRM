import type { Queryable } from '@crm/database';
import { toDomainEvent, type DomainEvent } from '@crm/events';

export interface ClaimedEvent extends DomainEvent {
  attempts: number;
}

const COLUMNS = `id, organization_id, event_type, event_version, aggregate_type, aggregate_id,
  actor_user_id, payload, occurred_at, attempts`;

/**
 * Claims up to `limit` due events in one statement. FOR UPDATE SKIP LOCKED
 * keeps concurrent relays from picking the same rows; the claim is a lease:
 * events whose claim is older than `leaseSeconds` (crashed worker) are
 * claimable again. Attempts are counted per claim.
 */
export async function claimBatch(
  db: Queryable,
  options: { limit: number; leaseSeconds: number; workerId: string },
): Promise<Array<{ event: ClaimedEvent | null; id: string; attempts: number; error?: string }>> {
  const result = await db.query(
    `WITH picked AS (
       SELECT id FROM outbox_events
       WHERE processed_at IS NULL AND failed_at IS NULL AND available_at <= now()
         AND (claimed_at IS NULL OR claimed_at < now() - make_interval(secs => $2))
       ORDER BY available_at, occurred_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE outbox_events o
     SET claimed_at = now(), claimed_by = $3, attempts = o.attempts + 1
     FROM picked WHERE o.id = picked.id
     RETURNING ${COLUMNS.split(',')
       .map((c) => `o.${c.trim()}`)
       .join(', ')}`,
    [options.limit, options.leaseSeconds, options.workerId],
  );
  return result.rows.map((row) => {
    try {
      return {
        id: row.id,
        attempts: row.attempts,
        event: { ...toDomainEvent(row), attempts: row.attempts },
      };
    } catch (error) {
      // Unknown type / invalid payload: surfaced as a dead event, never guessed at.
      return { id: row.id, attempts: row.attempts, event: null, error: (error as Error).message };
    }
  });
}

/** Only the current claimant may settle an event (a reclaimed lease invalidates the old claim). */
export async function markProcessed(db: Queryable, id: string, workerId: string): Promise<void> {
  await db.query(
    `UPDATE outbox_events SET processed_at = now(), last_error = NULL
     WHERE id = $1 AND claimed_by = $2 AND processed_at IS NULL`,
    [id, workerId],
  );
}

export async function release(
  db: Queryable,
  id: string,
  workerId: string,
  error: string,
  delaySeconds: number,
): Promise<void> {
  await db.query(
    `UPDATE outbox_events
     SET claimed_at = NULL, claimed_by = NULL, last_error = $3,
         available_at = now() + make_interval(secs => $4)
     WHERE id = $1 AND claimed_by = $2 AND processed_at IS NULL`,
    [id, workerId, error.slice(0, 500), delaySeconds],
  );
}

/** Permanent failure: kept for inspection, never retried, never blocks other events. */
export async function markDead(db: Queryable, id: string, error: string): Promise<void> {
  await db.query(
    `UPDATE outbox_events SET failed_at = now(), last_error = $2, claimed_at = NULL, claimed_by = NULL
     WHERE id = $1 AND processed_at IS NULL`,
    [id, error.slice(0, 500)],
  );
}

/** Reads one event of an organization (consumers never load events across tenants). */
export async function loadEvent(
  db: Queryable,
  organizationId: number,
  eventId: string,
): Promise<DomainEvent | null> {
  const result = await db.query(
    `SELECT ${COLUMNS} FROM outbox_events WHERE id = $1 AND organization_id = $2`,
    [eventId, organizationId],
  );
  return result.rows[0] ? toDomainEvent(result.rows[0]) : null;
}

/** Deletes processed events past retention (dead events are kept). Returns rows removed. */
export async function prune(db: Queryable, retentionDays: number, batch = 1_000): Promise<number> {
  const result = await db.query(
    `DELETE FROM outbox_events WHERE id IN (
       SELECT id FROM outbox_events
       WHERE processed_at IS NOT NULL AND processed_at < now() - make_interval(days => $1)
       LIMIT $2)`,
    [retentionDays, batch],
  );
  return result.rowCount ?? 0;
}

export async function stats(db: Queryable) {
  const result = await db.query(
    `SELECT count(*) FILTER (WHERE processed_at IS NULL AND failed_at IS NULL)::int AS pending,
            count(*) FILTER (WHERE failed_at IS NOT NULL)::int AS dead,
            min(available_at) FILTER (WHERE processed_at IS NULL AND failed_at IS NULL) AS oldest_pending
     FROM outbox_events`,
  );
  return result.rows[0] as { pending: number; dead: number; oldest_pending: Date | null };
}
