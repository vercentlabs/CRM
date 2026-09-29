import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createTestSchema, hasTestDatabase, withTransaction, type TestSchema } from '@crm/database';
import { appendEvent } from '@crm/events';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeSms, seed, testDeps, type Seed } from './__tests__/fixtures.js';
import * as outbox from './db/outbox.js';
import { createJobRunner } from './jobs/runner.js';
import { silentLogger } from './logger.js';
import { createRelay } from './outbox/relay.js';
import { createInlineDriver } from './queue/inline.js';
import type { QueueDriver } from './queue/types.js';

describe.skipIf(!hasTestDatabase)('transactional outbox (PostgreSQL)', () => {
  let db: TestSchema;
  let fx: Seed;

  beforeAll(async () => {
    db = await createTestSchema('wk_outbox');
    fx = await seed(db.pool);
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query('DELETE FROM outbox_events');
  });

  const leadCreated = (leadId: number, organizationId = fx.orgA) => ({
    type: 'lead.created' as const,
    organizationId,
    actorUserId: fx.users.aAdmin,
    aggregateId: leadId,
    payload: { leadId, assignedTo: null },
  });
  const count = async () =>
    Number((await db.pool.query('SELECT count(*) FROM outbox_events')).rows[0].count);
  const relay = (queue: QueueDriver, workerId = 'w1', overrides = {}) =>
    createRelay({
      db: db.pool,
      queue,
      logger: silentLogger,
      workerId,
      batchSize: 50,
      leaseSeconds: 60,
      maxAttempts: 3,
      pollMs: 10,
      ...overrides,
    });

  it('writes events in the same transaction as the domain change', async () => {
    await expect(
      withTransaction(db.pool, async (tx) => {
        await tx.query(`UPDATE leads SET notes = 'changed' WHERE id = $1`, [fx.leadA]);
        await appendEvent(tx, leadCreated(fx.leadA));
        throw new Error('business rule failed');
      }),
    ).rejects.toThrow();
    expect(await count()).toBe(0);
    const notes = (await db.pool.query('SELECT notes FROM leads WHERE id = $1', [fx.leadA])).rows[0]
      .notes;
    expect(notes).toBeNull();

    await withTransaction(db.pool, (tx) => appendEvent(tx, leadCreated(fx.leadA)));
    expect(await count()).toBe(1);
  });

  it('never lets two concurrent claimers take the same event', async () => {
    for (let i = 0; i < 40; i++) await appendEvent(db.pool, leadCreated(fx.leadA));
    const claims = await Promise.all(
      ['w1', 'w2', 'w3', 'w4'].map((workerId) =>
        outbox.claimBatch(db.pool, { limit: 15, leaseSeconds: 60, workerId }),
      ),
    );
    const ids = claims.flat().map((c) => c.id);
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
  });

  it('recovers events abandoned by a crashed worker once the lease expires', async () => {
    await appendEvent(db.pool, leadCreated(fx.leadA));
    const [first] = await outbox.claimBatch(db.pool, {
      limit: 10,
      leaseSeconds: 60,
      workerId: 'crashed',
    });
    expect(first!.attempts).toBe(1);
    // Within the lease nobody else can take it.
    expect(
      await outbox.claimBatch(db.pool, { limit: 10, leaseSeconds: 60, workerId: 'w2' }),
    ).toHaveLength(0);
    await db.pool.query(`UPDATE outbox_events SET claimed_at = now() - interval '2 minutes'`);
    const [again] = await outbox.claimBatch(db.pool, {
      limit: 10,
      leaseSeconds: 60,
      workerId: 'w2',
    });
    expect(again!.id).toBe(first!.id);
    expect(again!.attempts).toBe(2);
    // The crashed worker's late "processed" is ignored; the new claimant settles it.
    await outbox.markProcessed(db.pool, first!.id, 'crashed');
    expect(
      (await db.pool.query('SELECT processed_at FROM outbox_events')).rows[0].processed_at,
    ).toBeNull();
    await outbox.markProcessed(db.pool, first!.id, 'w2');
    expect(
      (await db.pool.query('SELECT processed_at FROM outbox_events')).rows[0].processed_at,
    ).not.toBeNull();
  });

  it('re-dispatching after a crash between enqueue and "processed" causes no duplicate side effect', async () => {
    const sms = fakeSms();
    const { deps, queue } = testDeps(db.pool, { sms });
    await queue.start(createJobRunner(deps));
    const message = (
      await db.pool.query(
        `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content, status, queued_at)
         VALUES ($1, $2, $3, 'SMS', 'hello', 'Queued', now()) RETURNING id`,
        [fx.orgA, fx.leadA, fx.users.aSales],
      )
    ).rows[0].id;
    await appendEvent(db.pool, {
      type: 'message.requested',
      organizationId: fx.orgA,
      aggregateId: message,
      payload: { messageId: message, leadId: fx.leadA, channel: 'sms' },
    });
    await relay(queue).dispatchOnce();
    await (queue as ReturnType<typeof createInlineDriver>).drain();
    // Simulate the crash: the event looks unprocessed with an expired claim.
    await db.pool.query(
      `UPDATE outbox_events SET processed_at = NULL, claimed_at = now() - interval '5 minutes'`,
    );
    await relay(queue, 'w2').dispatchOnce();
    await (queue as ReturnType<typeof createInlineDriver>).drain();
    expect(sms.calls).toHaveLength(1);
    // Even a fresh queue (job ids forgotten) is safe: the message state machine refuses to resend.
    const fresh = createInlineDriver();
    await fresh.start(createJobRunner({ ...deps, queue: fresh }));
    await db.pool.query(`UPDATE outbox_events SET processed_at = NULL, claimed_at = NULL`);
    await relay(fresh, 'w3').dispatchOnce();
    await fresh.drain();
    expect(sms.calls).toHaveLength(1);
    const row = (await db.pool.query('SELECT status FROM messages WHERE id = $1', [message]))
      .rows[0];
    expect(row.status).toBe('Sent');
  });

  it('keeps events pending when the queue backend is down, then dead-letters without blocking others', async () => {
    const down: QueueDriver = {
      kind: 'bullmq',
      enqueue: async () => {
        throw new Error('Connection is closed.');
      },
      schedule: async () => undefined,
      start: async () => undefined,
      close: async () => undefined,
      ping: async () => false,
      counts: async () => ({}),
    };
    await appendEvent(db.pool, leadCreated(fx.leadA));
    await relay(down).dispatchOnce();
    let row = (await db.pool.query('SELECT * FROM outbox_events')).rows[0];
    expect(row.processed_at).toBeNull();
    expect(row.failed_at).toBeNull();
    expect(row.last_error).toContain('Connection is closed');
    expect(new Date(row.available_at).getTime()).toBeGreaterThan(Date.now());

    // Exhaust attempts.
    for (let i = 0; i < 2; i++) {
      await db.pool.query(`UPDATE outbox_events SET available_at = now()`);
      await relay(down).dispatchOnce();
    }
    row = (await db.pool.query('SELECT * FROM outbox_events')).rows[0];
    expect(row.failed_at).not.toBeNull();
    expect(row.attempts).toBe(3);

    // A new event still flows once the backend is back.
    await appendEvent(db.pool, leadCreated(fx.leadA));
    const healthy = createInlineDriver();
    await relay(healthy).dispatchOnce();
    const states = (
      await db.pool.query(
        `SELECT count(*) FILTER (WHERE processed_at IS NOT NULL)::int AS processed,
                count(*) FILTER (WHERE failed_at IS NOT NULL)::int AS dead FROM outbox_events`,
      )
    ).rows[0];
    expect(states).toEqual({ processed: 1, dead: 1 });
  });

  it('dead-letters malformed events instead of guessing', async () => {
    await db.pool.query(
      `INSERT INTO outbox_events (id, organization_id, event_type, aggregate_type, aggregate_id, payload)
       VALUES (gen_random_uuid(), $1, 'lead.created', 'lead', '1', '{"leadId":"not-a-number"}')`,
      [fx.orgA],
    );
    await relay(createInlineDriver()).dispatchOnce();
    const row = (await db.pool.query('SELECT failed_at, last_error FROM outbox_events')).rows[0];
    expect(row.failed_at).not.toBeNull();
    expect(row.last_error).toMatch(/Invalid event/);
  });

  it('prunes processed events past retention but keeps dead ones', async () => {
    await appendEvent(db.pool, leadCreated(fx.leadA));
    await appendEvent(db.pool, leadCreated(fx.leadA));
    await db.pool.query(
      `UPDATE outbox_events SET processed_at = now() - interval '30 days'
       WHERE id = (SELECT id FROM outbox_events LIMIT 1)`,
    );
    await db.pool.query(
      `UPDATE outbox_events SET failed_at = now() - interval '30 days' WHERE processed_at IS NULL`,
    );
    expect(await outbox.prune(db.pool, 14)).toBe(1);
    expect(await count()).toBe(1);
  });
  it('recovers jobs lost with Redis data by replaying outbox events (scripts/outbox-replay.mjs)', async () => {
    const sms = fakeSms();
    const { deps } = testDeps(db.pool, { sms });
    const message = (
      await db.pool.query(
        `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content, status, queued_at)
         VALUES ($1, $2, $3, 'SMS', 'Lost in Redis', 'Queued', now()) RETURNING id`,
        [fx.orgA, fx.leadA, fx.users.aSales],
      )
    ).rows[0].id as number;
    const before = new Date(Date.now() - 1000);
    await appendEvent(db.pool, {
      type: 'message.requested',
      organizationId: fx.orgA,
      aggregateId: message,
      payload: { messageId: message, leadId: fx.leadA, channel: 'sms' },
    });
    // Dispatched into a queue that is then lost before any worker ran the job.
    const lost = createInlineDriver();
    await relay(lost).dispatchOnce();
    expect(sms.calls).toHaveLength(0);

    const script = path.resolve(
      import.meta.dirname,
      '../../../packages/database/scripts/outbox-replay.mjs',
    );
    const output = execFileSync(
      process.execPath,
      [script, '--since', before.toISOString(), '--apply'],
      {
        env: { ...process.env, DATABASE_URL: db.url },
        encoding: 'utf8',
      },
    );
    expect(output).toMatch(/Marked 1 event\(s\) pending/);

    const recovered = createInlineDriver();
    await recovered.start(createJobRunner({ ...deps, queue: recovered }));
    await relay(recovered, 'w-recover').dispatchOnce();
    await recovered.drain();
    expect(sms.calls).toHaveLength(1);
    const row = (await db.pool.query('SELECT status FROM messages WHERE id = $1', [message]))
      .rows[0];
    expect(row.status).toBe('Sent');
  });
});
