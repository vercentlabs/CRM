#!/usr/bin/env node
/**
 * Redis data-loss recovery: re-dispatch outbox events processed since a point
 * in time (docs/operations/BACKUP_AND_RECOVERY.md#redis-loss).
 *
 *   DATABASE_URL=… node packages/database/scripts/outbox-replay.mjs --since 2026-01-01T10:00:00Z [--apply]
 *
 * Jobs live in Redis only after their outbox event was marked processed; if
 * Redis loses data, those jobs are gone while PostgreSQL still has the events.
 * Every processor is idempotent (message status machine, notification and
 * delivery dedupe keys, unique webhook deliveries), so marking the events
 * pending again makes the relay enqueue them once more without duplicate
 * side effects. Without --apply it only reports what would be replayed.
 */
import { createPool } from '../dist/index.js';

const args = process.argv.slice(2);
const sinceArg = args[args.indexOf('--since') + 1];
const apply = args.includes('--apply');
const since = sinceArg ? new Date(sinceArg) : undefined;
if (!process.env.DATABASE_URL || !since || Number.isNaN(since.getTime())) {
  console.error('Usage: DATABASE_URL=… outbox-replay.mjs --since <ISO timestamp> [--apply]');
  process.exit(2);
}

const pool = createPool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  applicationName: 'crm-outbox-replay',
});
try {
  const preview = await pool.query(
    `SELECT event_type, count(*)::int AS n FROM outbox_events
     WHERE processed_at >= $1 GROUP BY event_type ORDER BY n DESC`,
    [since],
  );
  const total = preview.rows.reduce((sum, row) => sum + row.n, 0);
  console.log(`${total} event(s) processed since ${since.toISOString()}:`);
  for (const row of preview.rows) console.log(`  ${row.event_type.padEnd(36)} ${row.n}`);
  if (!apply) {
    console.log(
      '\nDry run. Re-run with --apply to mark them pending (the worker relay re-dispatches them).',
    );
  } else {
    const result = await pool.query(
      `UPDATE outbox_events
         SET processed_at = NULL, claimed_at = NULL, claimed_by = NULL, attempts = 0,
             available_at = now(), last_error = 'replayed after Redis data loss'
       WHERE processed_at >= $1`,
      [since],
    );
    console.log(`\nMarked ${result.rowCount} event(s) pending.`);
  }
} finally {
  await pool.end();
}
