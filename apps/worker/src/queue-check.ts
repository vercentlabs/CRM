import 'dotenv/config';
import { Queue } from 'bullmq';
import { createPool } from '@crm/database';
import { stats } from './db/outbox.js';
import { loadWorkerEnv } from './env.js';
import { QUEUE_NAMES } from './jobs/definitions.js';

/**
 * `pnpm queue:check`: outbox backlog and per-queue job counts (including
 * retained failed jobs), for operators. Read-only; prints no payloads.
 */
const env = loadWorkerEnv();
const db = createPool({ connectionString: env.DATABASE_URL, max: 1 });
const report: Record<string, unknown> = { outbox: await stats(db) };
await db.end();

if (env.REDIS_URL) {
  for (const name of QUEUE_NAMES) {
    const queue = new Queue(name, {
      connection: { url: env.REDIS_URL, enableOfflineQueue: false, maxRetriesPerRequest: 1 },
      prefix: env.QUEUE_PREFIX,
    });
    report[name] = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
    const failed = await queue.getFailed(0, 4);
    report[`${name}.recentFailures`] = failed.map((job) => ({
      id: job.id,
      name: job.name,
      attempts: job.attemptsMade,
      reason: job.failedReason?.slice(0, 200),
      finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    }));
    await queue.close();
  }
} else {
  report.queues = 'REDIS_URL not set (inline mode)';
}
console.log(JSON.stringify(report, null, 2));
