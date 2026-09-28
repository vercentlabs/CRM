import { createTestSchema, hasTestDatabase, type TestSchema } from '@crm/database';
import { appendEvent } from '@crm/events';
import type { SmsProvider } from '@crm/integrations';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seed, testDeps, workerOptions, type Seed } from './__tests__/fixtures.js';
import { loadWorkerEnv } from './env.js';
import { JOBS, JOB_NAMES, parseJob } from './jobs/definitions.js';
import { createJobRunner } from './jobs/runner.js';
import { silentLogger } from './logger.js';
import { createInlineDriver } from './queue/inline.js';
import { PermanentJobError } from './queue/types.js';
import { createWorker } from './worker.js';

describe('job definitions', () => {
  it('requires an organization id on every tenant job', () => {
    for (const name of JOB_NAMES) {
      const definition = JOBS[name];
      const shape = (definition.schema as unknown as { shape: Record<string, unknown> }).shape;
      if ('platform' in definition && definition.platform) continue;
      expect(Object.keys(shape), name).toContain('organizationId');
    }
  });

  it('rejects unknown fields and wrong types (payloads are parsed, never evaluated)', () => {
    expect(() =>
      parseJob('message.send', { organizationId: 1, messageId: 2, content: 'x' }),
    ).toThrow();
    expect(() => parseJob('message.send', { organizationId: '1; DROP', messageId: 2 })).toThrow();
    expect(() => parseJob('notification.event', { organizationId: 1, eventId: 'nope' })).toThrow();
    expect(parseJob('message.send', { organizationId: 1, messageId: 2 })).toEqual({
      organizationId: 1,
      messageId: 2,
    });
  });

  it('fails invalid or unknown jobs permanently', async () => {
    const run = createJobRunner({ logger: silentLogger } as never);
    await expect(
      run({ id: 'a', name: 'message.send', data: { messageId: 1 }, attempt: 1, maxAttempts: 5 }),
    ).rejects.toBeInstanceOf(PermanentJobError);
    await expect(
      run({ id: 'b', name: 'eval', data: {}, attempt: 1, maxAttempts: 1 }),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });
});

describe('inline queue driver', () => {
  it('deduplicates ids, retries transient errors and stops on permanent ones', async () => {
    const queue = createInlineDriver();
    const seen: string[] = [];
    let flaky = 0;
    await queue.start(async (job) => {
      seen.push(`${job.id}#${job.attempt}`);
      if (job.id === 'flaky' && ++flaky < 3) throw new Error('transient');
      if (job.id === 'bad') throw new PermanentJobError('no');
    });
    await queue.enqueue({ name: 'reminders.scan', payload: {}, id: 'once' });
    await queue.enqueue({ name: 'reminders.scan', payload: {}, id: 'once' });
    await queue.enqueue({ name: 'message.send', payload: {}, id: 'flaky' });
    await queue.enqueue({ name: 'message.send', payload: {}, id: 'bad' });
    await queue.drain();
    expect(seen.filter((s) => s.startsWith('once'))).toEqual(['once#1']);
    expect(seen.filter((s) => s.startsWith('flaky'))).toEqual(['flaky#1', 'flaky#2', 'flaky#3']);
    expect(seen.filter((s) => s.startsWith('bad'))).toEqual(['bad#1']);
    expect(queue.failed.map((f) => f.id)).toEqual(['bad']);
    await queue.close(100);
    await expect(
      queue.enqueue({ name: 'reminders.scan', payload: {}, id: 'late' }),
    ).rejects.toThrow(/closed/);
  });
});

describe('worker environment', () => {
  const base = { DATABASE_URL: 'postgres://x', STORAGE_PROVIDER: 'memory' };
  it('runs without Redis in development', () => {
    expect(loadWorkerEnv(base).REDIS_URL).toBeUndefined();
  });
  it('refuses unsafe production configuration', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'memory',
      SMS_PROVIDER: 'log',
      WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true',
    };
    expect(() => loadWorkerEnv(prod)).toThrow(/REDIS_URL/);
    expect(() => loadWorkerEnv(prod)).toThrow(/STORAGE_PROVIDER/);
    expect(() => loadWorkerEnv(prod)).toThrow(/EMAIL_PROVIDER/);
    expect(() => loadWorkerEnv(prod)).toThrow(/SMS_PROVIDER/);
    expect(() => loadWorkerEnv(prod)).toThrow(/WEBHOOK_ALLOW_PRIVATE_TARGETS/);
    expect(() => loadWorkerEnv({ ...base, SMS_PROVIDER: 'plivo' })).toThrow(/PLIVO_AUTH_ID/);
  });
});

describe.skipIf(!hasTestDatabase)('worker lifecycle (PostgreSQL)', () => {
  let db: TestSchema;
  let fx: Seed;

  beforeAll(async () => {
    db = await createTestSchema('wk_life');
    fx = await seed(db.pool);
  });
  afterAll(async () => db?.drop());

  it('processes outbox events end to end and drains active jobs on graceful shutdown', async () => {
    let release: () => void = () => undefined;
    const slow: SmsProvider & { started: number } = {
      name: 'slow',
      started: 0,
      async send() {
        slow.started += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { providerMessageId: `slow-${Date.now()}` };
      },
    };
    const { deps } = testDeps(db.pool, { sms: slow });
    const worker = createWorker(deps, workerOptions);
    await worker.start();
    expect((await worker.health()).ready).toBe(true);

    const id = (
      await db.pool.query(
        `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content, status, queued_at)
         VALUES ($1, $2, $3, 'SMS', 'hi', 'Queued', now()) RETURNING id`,
        [fx.orgA, fx.leadA, fx.users.aSales],
      )
    ).rows[0].id;
    await appendEvent(db.pool, {
      type: 'message.requested',
      organizationId: fx.orgA,
      aggregateId: id,
      payload: { messageId: id, leadId: fx.leadA, channel: 'sms' },
    });
    // The relay loop picks it up and the job starts calling the (slow) provider.
    await expect.poll(() => slow.started, { timeout: 5_000 }).toBe(1);

    const stopping = worker.stop('SIGTERM');
    setTimeout(() => release(), 200);
    await stopping;
    expect(worker.running).toBe(false);
    // The in-flight job completed before shutdown finished.
    const row = (await db.pool.query('SELECT status FROM messages WHERE id = $1', [id])).rows[0];
    expect(row.status).toBe('Sent');
    // Stopped: no more work is accepted, and the database pool (owned by the test) still works.
    await expect(
      deps.queue.enqueue({ name: 'reminders.scan', payload: {}, id: 'after-stop' }),
    ).rejects.toThrow();
    expect((await worker.health()).ready).toBe(false);
    const processed = await db.pool.query('SELECT processed_at FROM outbox_events');
    expect(processed.rows[0].processed_at).not.toBeNull();
  });
});
