import type { DatabasePool } from '@crm/database';
import { buildInfo, createRegistry, promClient } from '@crm/observability';
import { stats } from './db/outbox.js';
import type { QueueDriver } from './queue/types.js';

/**
 * Worker metrics. Outbox and queue gauges are read at scrape time (no polling
 * loop). Labels: job_name (not `job`, which Prometheus reserves for the scrape job), queue, result — never organization or entity ids.
 */
export const registry = createRegistry('worker', buildInfo());

export const jobDuration = new promClient.Histogram({
  name: 'crm_job_duration_seconds',
  help: 'Job processing duration by job and result',
  labelNames: ['job_name', 'result'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 15, 30, 60],
  registers: [registry],
});

export const jobRetries = new promClient.Counter({
  name: 'crm_job_retries_total',
  help: 'Job attempts that failed and will be retried',
  labelNames: ['job_name'],
  registers: [registry],
});

export const jobFailures = new promClient.Counter({
  name: 'crm_job_failures_total',
  help: 'Jobs that failed terminally (communications, webhooks, notifications, …)',
  labelNames: ['job_name'],
  registers: [registry],
});

export const outboxDispatchErrors = new promClient.Counter({
  name: 'crm_outbox_dispatch_errors_total',
  help: 'Outbox events that could not be enqueued (retried with backoff)',
  registers: [registry],
});

export function registerRuntimeGauges(db: DatabasePool, queue: QueueDriver): void {
  new promClient.Gauge({
    name: 'crm_outbox_events',
    help: 'Outbox events by state',
    labelNames: ['state'],
    registers: [registry],
    async collect() {
      const s = await stats(db);
      this.set({ state: 'pending' }, s.pending);
      this.set({ state: 'dead' }, s.dead);
    },
  });
  new promClient.Gauge({
    name: 'crm_outbox_oldest_pending_seconds',
    help: 'Age of the oldest pending outbox event (0 when none)',
    registers: [registry],
    async collect() {
      const s = await stats(db);
      this.set(
        s.oldest_pending
          ? Math.max(0, (Date.now() - new Date(s.oldest_pending).getTime()) / 1000)
          : 0,
      );
    },
  });
  new promClient.Gauge({
    name: 'crm_queue_jobs',
    help: 'Queue jobs by queue and state',
    labelNames: ['queue', 'state'],
    registers: [registry],
    async collect() {
      for (const [name, counts] of Object.entries(await queue.counts())) {
        for (const [state, value] of Object.entries(counts))
          this.set({ queue: name, state }, value);
      }
    },
  });
  new promClient.Gauge({
    name: 'crm_worker_db_pool_connections',
    help: 'Worker database pool connections by state',
    labelNames: ['state'],
    registers: [registry],
    collect() {
      this.set({ state: 'total' }, db.totalCount);
      this.set({ state: 'idle' }, db.idleCount);
      this.set({ state: 'waiting' }, db.waitingCount);
    },
  });
}
