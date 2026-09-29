import { createServer, type Server } from 'node:http';
import { checkDatabase } from '@crm/database';
import { metricsAuthorized } from '@crm/observability';
import type { WorkerDeps } from './jobs/context.js';
import { createJobRunner } from './jobs/runner.js';
import { errorInfo } from './logger.js';
import { registerRuntimeGauges, registry } from './metrics.js';
import { createRelay } from './outbox/relay.js';

export interface WorkerOptions {
  workerId: string;
  outbox: { batchSize: number; leaseSeconds: number; maxAttempts: number; pollMs: number };
  schedules: { remindersMs: number; maintenanceMs: number };
  healthPort: number;
  shutdownTimeoutMs: number;
  /** Close the database pool on stop (true for the process, false when tests own the pool). */
  closeDatabase: boolean;
  /** Bearer token for GET /metrics on the health port (unset = disabled). */
  metricsToken?: string | undefined;
  /** Production: readiness requires the durable (Redis) queue driver. */
  requireDurableQueue?: boolean;
}

export interface HealthState {
  ready: boolean;
  database: boolean;
  queue: boolean;
  relay: boolean;
  draining: boolean;
}

export interface Worker {
  start(): Promise<void>;
  stop(reason?: string): Promise<void>;
  health(): Promise<HealthState>;
  readonly running: boolean;
  /** Test hook: run one relay pass synchronously. */
  dispatchOutbox(): Promise<number>;
}

const json = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

/**
 * The worker process: outbox relay + queue consumers + recurring schedules,
 * and an optional minimal health/metrics endpoint (no business API).
 * Shutdown order: readiness fails (draining) → stop claiming outbox events →
 * stop consumers and let active jobs finish (bounded) → close Redis → close
 * the database → done.
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
  let draining = false;
  let server: Server | undefined;
  registerRuntimeGauges(deps.db, deps.queue);

  const health = async (): Promise<HealthState> => {
    const [database, queue] = await Promise.all([
      checkDatabase(deps.db)
        .then((r) => r.ok)
        .catch(() => false),
      deps.queue.ping(),
    ]);
    const durable = !options.requireDurableQueue || deps.queue.kind === 'bullmq';
    const relayRunning = relay.running;
    return {
      ready: running && !draining && database && queue && durable && relayRunning,
      database,
      queue: queue && durable,
      relay: relayRunning,
      draining,
    };
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
            json(res, running ? 200 : 503, { status: running ? 'ok' : 'stopping' });
          } else if (req.url === '/health/ready') {
            void health().then((h) =>
              json(res, h.ready ? 200 : 503, {
                status: h.ready ? 'ok' : 'unavailable',
                checks: {
                  database: h.database,
                  queue: h.queue,
                  relay: h.relay,
                  draining: h.draining,
                },
              }),
            );
          } else if (req.url === '/metrics') {
            if (!options.metricsToken) return json(res, 404, { status: 'not_found' });
            if (!metricsAuthorized(req.headers.authorization, options.metricsToken)) {
              return json(res, 401, { status: 'unauthorized' });
            }
            void registry.metrics().then(
              (text) => {
                res.writeHead(200, {
                  'content-type': registry.contentType,
                  'cache-control': 'no-store',
                });
                res.end(text);
              },
              () => json(res, 500, { status: 'error' }),
            );
          } else {
            json(res, 404, { status: 'not_found' });
          }
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
      if (!running || draining) return;
      draining = true;
      deps.logger.info('worker_stopping', { reason });
      await relay.stop();
      try {
        await deps.queue.close(options.shutdownTimeoutMs);
      } catch (error) {
        deps.logger.error('queue_close_failed', errorInfo(error));
      }
      running = false;
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      if (options.closeDatabase) await deps.db.end();
      deps.logger.info('worker_stopped', { reason });
    },
  };
}
