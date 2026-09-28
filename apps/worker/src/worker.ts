import { createServer, type Server } from 'node:http';
import { checkDatabase } from '@crm/database';
import type { WorkerDeps } from './jobs/context.js';
import { createJobRunner } from './jobs/runner.js';
import { errorInfo } from './logger.js';
import { createRelay } from './outbox/relay.js';

export interface WorkerOptions {
  workerId: string;
  outbox: { batchSize: number; leaseSeconds: number; maxAttempts: number; pollMs: number };
  schedules: { remindersMs: number; maintenanceMs: number };
  healthPort: number;
  shutdownTimeoutMs: number;
  /** Close the database pool on stop (true for the process, false when tests own the pool). */
  closeDatabase: boolean;
}

export interface Worker {
  start(): Promise<void>;
  stop(reason?: string): Promise<void>;
  health(): Promise<{ ready: boolean; database: boolean; queue: boolean }>;
  readonly running: boolean;
  /** Test hook: run one relay pass synchronously. */
  dispatchOutbox(): Promise<number>;
}

/**
 * The worker process: outbox relay + queue consumers + recurring schedules,
 * and an optional minimal health endpoint (no business API). Shutdown order:
 * stop claiming outbox events → stop consumers and let active jobs finish
 * (bounded) → close Redis → close the database → done.
 */
export function createWorker(deps: WorkerDeps, options: WorkerOptions): Worker {
  const relay = createRelay({
    db: deps.db,
    queue: deps.queue,
    logger: deps.logger,
    workerId: options.workerId,
    ...options.outbox,
  });
  let running = false;
  let server: Server | undefined;

  const health = async () => {
    const [database, queue] = await Promise.all([
      checkDatabase(deps.db)
        .then((r) => r.ok)
        .catch(() => false),
      deps.queue.ping(),
    ]);
    return { ready: running && database && queue, database, queue };
  };

  return {
    get running() {
      return running;
    },
    dispatchOutbox: () => relay.dispatchOnce(),
    health,
    async start() {
      if (running) return;
      running = true;
      await deps.queue.start(createJobRunner(deps));
      await deps.queue.schedule('reminders.scan', options.schedules.remindersMs);
      await deps.queue.schedule('maintenance.sweep', options.schedules.maintenanceMs);
      relay.start();
      if (options.healthPort > 0) {
        server = createServer((req, res) => {
          if (req.url === '/health/live') {
            res.writeHead(running ? 200 : 503, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ status: running ? 'ok' : 'stopping' }));
            return;
          }
          if (req.url === '/health/ready') {
            void health().then((h) => {
              res.writeHead(h.ready ? 200 : 503, { 'content-type': 'application/json' });
              res.end(
                JSON.stringify({
                  status: h.ready ? 'ok' : 'unavailable',
                  checks: { database: h.database, queue: h.queue },
                }),
              );
            });
            return;
          }
          res.writeHead(404).end();
        });
        await new Promise<void>((resolve) => server!.listen(options.healthPort, resolve));
      }
      deps.logger.info('worker_started', {
        workerId: options.workerId,
        queue: deps.queue.kind,
        sms: deps.sms.name,
        storage: deps.storage.provider,
      });
    },
    async stop(reason = 'stop requested') {
      if (!running) return;
      running = false;
      deps.logger.info('worker_stopping', { reason });
      await relay.stop();
      try {
        await deps.queue.close(options.shutdownTimeoutMs);
      } catch (error) {
        deps.logger.error('queue_close_failed', errorInfo(error));
      }
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      if (options.closeDatabase) await deps.db.end();
      deps.logger.info('worker_stopped', { reason });
    },
  };
}
