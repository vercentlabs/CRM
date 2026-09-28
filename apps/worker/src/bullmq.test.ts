import { randomUUID } from 'node:crypto';
import { createTestSchema, hasTestDatabase, type TestSchema } from '@crm/database';
import { appendEvent } from '@crm/events';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { silentLogger } from './logger.js';
import { createRelay } from './outbox/relay.js';
import { createBullmqDriver } from './queue/bullmq.js';
import { PermanentJobError, type RunningJob } from './queue/types.js';

const REDIS = process.env.REDIS_TEST_URL;

/** Real Redis (disposable container via REDIS_TEST_URL); skipped when not provided. */
describe.skipIf(!REDIS)('BullMQ driver (Redis)', () => {
  const driver = (prefix: string) =>
    createBullmqDriver({
      url: REDIS!,
      prefix,
      concurrency: 2,
      keepCompletedHours: 1,
      keepFailedDays: 1,
      logger: silentLogger,
    });
  const until = async (check: () => boolean | Promise<boolean>, timeout = 15_000) => {
    const end = Date.now() + timeout;
    while (!(await check())) {
      if (Date.now() > end) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  it('processes jobs, deduplicates by job id and stops retrying permanent failures', async () => {
    const prefix = `t${randomUUID().slice(0, 8)}`;
    const queue = driver(prefix);
    const runs: RunningJob[] = [];
    await queue.start(async (job) => {
      runs.push(job);
      if (job.id === 'bad') throw new PermanentJobError('rejected');
    });
    expect(await queue.ping()).toBe(true);
    await queue.enqueue({ name: 'reminders.scan', payload: {}, id: 'same' });
    await queue.enqueue({ name: 'reminders.scan', payload: {}, id: 'same' });
    await queue.enqueue({
      name: 'message.send',
      payload: { organizationId: 1, messageId: 1 },
      id: 'bad',
    });
    await until(() => runs.length >= 2);
    await new Promise((r) => setTimeout(r, 500));
    expect(runs.filter((r) => r.id === 'same')).toHaveLength(1);
    expect(runs.filter((r) => r.id === 'bad')).toHaveLength(1); // 5 attempts configured, 1 used

    const inspect = new Queue('communications', { connection: { url: REDIS! }, prefix });
    const failed = await inspect.getFailed();
    expect(failed.map((j) => [j.id, j.failedReason])).toEqual([['bad', 'rejected']]);
    await inspect.close();
    await queue.close(5_000);
  });

  it('retries transient failures with backoff and reports attempt numbers', async () => {
    const prefix = `t${randomUUID().slice(0, 8)}`;
    const queue = driver(prefix);
    const attempts: number[] = [];
    await queue.start(async (job) => {
      attempts.push(job.attempt);
      if (job.attempt < 2) throw new Error('transient');
    });
    // reminders.scan has 1 attempt; notification.event has 5 (5s base backoff).
    await queue.enqueue({
      name: 'notification.event',
      payload: { organizationId: 1, eventId: randomUUID() },
      id: 'retry-me',
    });
    await until(() => attempts.length >= 2, 30_000);
    expect(attempts).toEqual([1, 2]);
    await queue.close(5_000);
  }, 40_000);

  it('waits for the active job on close (graceful shutdown)', async () => {
    const prefix = `t${randomUUID().slice(0, 8)}`;
    const queue = driver(prefix);
    let finished = false;
    let started = false;
    await queue.start(async () => {
      started = true;
      await new Promise((r) => setTimeout(r, 400));
      finished = true;
    });
    await queue.enqueue({ name: 'reminders.scan', payload: {}, id: 'long' });
    await until(() => started);
    await queue.close(5_000);
    expect(finished).toBe(true);
  });

  it('rejects enqueue quickly when Redis is unreachable (never pretends success)', async () => {
    const down = createBullmqDriver({
      url: 'redis://127.0.0.1:1',
      prefix: 'down',
      concurrency: 1,
      keepCompletedHours: 1,
      keepFailedDays: 1,
      logger: silentLogger,
    });
    const started = Date.now();
    await expect(down.enqueue({ name: 'reminders.scan', payload: {}, id: 'x' })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(await down.ping()).toBe(false);
    await down.close(1_000).catch(() => undefined);
  });

  describe.skipIf(!hasTestDatabase)('outbox relay → Redis', () => {
    let db: TestSchema;
    beforeAll(async () => {
      db = await createTestSchema('wk_bull');
      await db.pool.query(`INSERT INTO organizations (name, slug) VALUES ('Alpha', 'alpha')`);
    });
    afterAll(async () => db?.drop());

    it('enqueues each event once even when dispatched twice', async () => {
      const prefix = `t${randomUUID().slice(0, 8)}`;
      const queue = driver(prefix);
      const org = (await db.pool.query('SELECT id FROM organizations')).rows[0].id;
      await appendEvent(db.pool, {
        type: 'lead.assigned',
        organizationId: org,
        aggregateId: 1,
        payload: { leadId: 1, assignedTo: 2, previousAssignedTo: null },
      });
      const relay = createRelay({
        db: db.pool,
        queue,
        logger: silentLogger,
        workerId: 'r1',
        batchSize: 10,
        leaseSeconds: 60,
        maxAttempts: 3,
        pollMs: 10,
      });
      await relay.dispatchOnce();
      await db.pool.query(`UPDATE outbox_events SET processed_at = NULL, claimed_at = NULL`);
      await relay.dispatchOnce();
      const inspect = new Queue('notifications', { connection: { url: REDIS! }, prefix });
      const counts = await inspect.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'completed',
        'failed',
      );
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(1);
      const webhooks = new Queue('webhooks', { connection: { url: REDIS! }, prefix });
      expect((await webhooks.getJobCounts('waiting')).waiting).toBe(1);
      await Promise.all([inspect.close(), webhooks.close(), queue.close(2_000)]);
    });
  });
});
