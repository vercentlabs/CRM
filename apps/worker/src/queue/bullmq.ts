import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import { JOBS, QUEUE_NAMES, type QueueName } from '../jobs/definitions.js';
import type { Logger } from '../logger.js';
import { PermanentJobError, type QueueDriver } from './types.js';

const ENQUEUE_TIMEOUT_MS = 5_000;

export interface BullmqOptions {
  url: string;
  prefix: string;
  concurrency: number;
  keepCompletedHours: number;
  keepFailedDays: number;
  logger: Logger;
}

/**
 * BullMQ driver. Producers fail fast (no offline queue) so a Redis outage is
 * reported to the outbox relay, which keeps the event pending instead of
 * pretending it was queued. Consumers use blocking connections that retry.
 * Finished jobs are retained for a bounded time/count so failures stay
 * inspectable (`pnpm queue:check`) without unbounded Redis growth.
 */
export function createBullmqDriver(options: BullmqOptions): QueueDriver {
  const producerConnection = {
    url: options.url,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  };
  const consumerConnection = { url: options.url, maxRetriesPerRequest: null };
  const queues = new Map<QueueName, Queue>(
    QUEUE_NAMES.map((name) => [
      name,
      new Queue(name, {
        connection: producerConnection,
        prefix: options.prefix,
        defaultJobOptions: {
          removeOnComplete: { age: options.keepCompletedHours * 3600, count: 5_000 },
          removeOnFail: { age: options.keepFailedDays * 86_400, count: 10_000 },
        },
      }),
    ]),
  );
  const workers: Worker[] = [];
  // Connection errors repeat on every reconnect attempt: log at most once a minute per source.
  const lastLogged = new Map<string, number>();
  const logError = (source: string, error: Error) => {
    const now = Date.now();
    if ((lastLogged.get(source) ?? 0) + 60_000 > now) return;
    lastLogged.set(source, now);
    options.logger.error('queue_connection_error', { source, error: error.message.slice(0, 200) });
  };
  for (const [name, queue] of queues)
    queue.on('error', (error) => logError(`queue.${name}`, error));

  return {
    kind: 'bullmq',
    async enqueue({ name, payload, id, delayMs }) {
      const definition = JOBS[name];
      const add = queues.get(definition.queue)!.add(name, payload, {
        jobId: id,
        attempts: definition.retry.attempts,
        backoff: { type: 'exponential', delay: definition.retry.backoffMs, jitter: 0.5 },
        ...(delayMs ? { delay: delayMs } : {}),
      });
      // add() waits for a ready connection; bound it so a Redis outage is reported (the
      // outbox keeps the event) instead of blocking. A late add is harmless: ids dedupe.
      add.catch(() => undefined);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          add,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Queue backend unavailable')),
              ENQUEUE_TIMEOUT_MS,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    async schedule(name, everyMs) {
      await queues
        .get(JOBS[name].queue)!
        .upsertJobScheduler(`schedule.${name}`, { every: everyMs }, { name, data: {} });
    },
    async start(run) {
      for (const queue of QUEUE_NAMES) {
        const worker = new Worker(
          queue,
          async (job: Job) => {
            try {
              await run({
                id: job.id ?? 'unknown',
                name: job.name,
                data: job.data,
                attempt: job.attemptsMade + 1,
                // Scheduler-created jobs report attempts 0; treat that as one attempt.
                maxAttempts: Math.max(1, job.opts.attempts ?? 1),
              });
            } catch (error) {
              // Permanent failures skip the remaining attempts (visible as failed).
              if (error instanceof PermanentJobError) throw new UnrecoverableError(error.message);
              throw error;
            }
          },
          {
            connection: consumerConnection,
            prefix: options.prefix,
            concurrency: options.concurrency,
            // Longer than any provider timeout, so a running job is never seen as stalled.
            lockDuration: 60_000,
          },
        );
        worker.on('error', (error) => logError(`worker.${queue}`, error));
        workers.push(worker);
      }
      await Promise.all(workers.map((w) => w.waitUntilReady()));
    },
    async close(timeoutMs) {
      // Worker.close() stops fetching and waits for active jobs; bound the wait.
      const graceful = Promise.all(workers.map((w) => w.close()));
      const timedOut = await Promise.race([
        graceful.then(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), timeoutMs).unref()),
      ]);
      if (timedOut) await Promise.all(workers.map((w) => w.close(true)));
      await Promise.all([...queues.values()].map((q) => q.close()));
    },
    async ping() {
      // A cheap real command on the fail-fast producer connection, bounded in time.
      try {
        await Promise.race([
          queues.get('maintenance')!.getJobCounts('waiting'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2_000).unref()),
        ]);
        return true;
      } catch {
        return false;
      }
    },
  };
}
