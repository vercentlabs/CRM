import { createTestSchema, hasTestDatabase, type TestSchema } from '@crm/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeSms, seed, testDeps, type Seed } from './__tests__/fixtures.js';
import type { JobContext } from './jobs/context.js';
import * as communications from './processors/communications.js';
import * as maintenance from './processors/maintenance.js';
import * as notifications from './processors/notifications.js';

const ctx = (attempt = 1): JobContext => ({
  id: 'j',
  attempt,
  maxAttempts: 5,
  finalAttempt: false,
});

/**
 * Several worker replicas (or a redelivered job) racing on the same work:
 * database row locks and dedupe keys must make the outcome exactly-once.
 */
describe.skipIf(!hasTestDatabase)('worker concurrency (PostgreSQL)', () => {
  let db: TestSchema;
  let fx: Seed;

  beforeAll(async () => {
    db = await createTestSchema('wk_concurrency');
    fx = await seed(db.pool);
  });
  afterAll(async () => db?.drop());

  it('sends a message once when several workers process the same job at the same time', async () => {
    const id = (
      await db.pool.query(
        `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content, status, queued_at)
         VALUES ($1, $2, $3, 'SMS', 'Parallel', 'Queued', now()) RETURNING id`,
        [fx.orgA, fx.leadA, fx.users.aSales],
      )
    ).rows[0].id as number;
    const sms = fakeSms();
    const { deps } = testDeps(db.pool, { sms });
    const job = { organizationId: fx.orgA, messageId: id };
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => communications.sendMessage(deps, job, ctx(i + 1))),
    );
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(sms.calls).toHaveLength(1);
    const row = (await db.pool.query('SELECT status, attempts FROM messages WHERE id = $1', [id]))
      .rows[0];
    expect(row).toMatchObject({ status: 'Sent', attempts: 1 });
  });

  it('settles a send abandoned mid-call (worker crash) without resending it', async () => {
    const id = (
      await db.pool.query(
        `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content, status,
                               queued_at, sending_started_at)
         VALUES ($1, $2, $3, 'SMS', 'Crashed', 'Sending', now(), now() - interval '10 minutes')
         RETURNING id`,
        [fx.orgA, fx.leadA, fx.users.aSales],
      )
    ).rows[0].id as number;
    const fresh = (
      await db.pool.query(
        `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content, status,
                               queued_at, sending_started_at)
         VALUES ($1, $2, $3, 'SMS', 'In flight', 'Sending', now(), now()) RETURNING id`,
        [fx.orgA, fx.leadA, fx.users.aSales],
      )
    ).rows[0].id as number;
    const sms = fakeSms();
    const { deps } = testDeps(db.pool, { sms });
    const result = await maintenance.sweep(deps);
    expect(result.staleSends).toBe(1);
    const status = async (m: number) =>
      (await db.pool.query('SELECT status, failure_code FROM messages WHERE id = $1', [m])).rows[0];
    expect(await status(id)).toEqual({ status: 'Failed', failure_code: 'DELIVERY_UNKNOWN' });
    expect((await status(fresh)).status).toBe('Sending');
    // A duplicate job for the in-flight message leaves it to the live attempt.
    await communications.sendMessage(deps, { organizationId: fx.orgA, messageId: fresh }, ctx(2));
    expect((await status(fresh)).status).toBe('Sending');
    expect(sms.calls).toHaveLength(0);
  });

  it('creates each reminder once when scans run in parallel on several replicas', async () => {
    await db.pool.query('DELETE FROM notifications');
    await db.pool.query(
      `UPDATE leads SET next_call_at = now() + interval '10 minutes' WHERE id IN ($1, $2)`,
      [fx.leadA, fx.leadB],
    );
    const { deps } = testDeps(db.pool);
    await Promise.all(Array.from({ length: 8 }, () => notifications.scanReminders(deps)));
    const counts = (
      await db.pool.query(
        `SELECT dedupe_key, count(*)::int AS n FROM notifications GROUP BY dedupe_key`,
      )
    ).rows;
    expect(counts.length).toBeGreaterThanOrEqual(2);
    expect(counts.every((r) => r.n === 1)).toBe(true);
  });

  it('runs maintenance sweeps concurrently without double work or errors', async () => {
    await db.pool.query(
      `INSERT INTO files (organization_id, provider, provider_file_id, storage_key, url, filename, mime_type,
                          size_bytes, purpose, status, expires_at)
       SELECT $1, 'memory', 'c' || g, 'k' || g, 'memory://k' || g, 'f.txt', 'text/plain', 1,
              'chat_attachment', 'uploaded', now() - interval '1 hour'
       FROM generate_series(1, 20) g`,
      [fx.orgA],
    );
    const { deps } = testDeps(db.pool);
    const results = await Promise.all(Array.from({ length: 4 }, () => maintenance.sweep(deps)));
    expect(results.reduce((sum, r) => sum + r.expiredUploads, 0)).toBe(20);
  });
});
