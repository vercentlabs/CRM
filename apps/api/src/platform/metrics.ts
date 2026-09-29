import type { DatabasePool } from '@crm/database';
import { buildInfo, createRegistry, metricsAuthorized, promClient } from '@crm/observability';
import type { RequestHandler } from 'express';

/**
 * API metrics (Prometheus text format at GET /metrics, bearer-protected by
 * METRICS_TOKEN; disabled when unset). Labels are bounded: method, route
 * template, status class, a small set of reasons/policies. Never ids.
 */
export const registry = createRegistry('api', buildInfo());

export const httpRequests = new promClient.Counter({
  name: 'crm_http_requests_total',
  help: 'HTTP requests by route template and status class',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

export const httpDuration = new promClient.Histogram({
  name: 'crm_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpActive = new promClient.Gauge({
  name: 'crm_http_requests_active',
  help: 'In-flight HTTP requests',
  registers: [registry],
});

export const authFailures = new promClient.Counter({
  name: 'crm_auth_failures_total',
  help: 'Authentication failures by reason',
  labelNames: ['reason'],
  registers: [registry],
});

export const rateLimitBlocks = new promClient.Counter({
  name: 'crm_rate_limit_blocks_total',
  help: 'Requests rejected by a rate-limit policy',
  labelNames: ['policy'],
  registers: [registry],
});

export const rateLimitStoreErrors = new promClient.Counter({
  name: 'crm_rate_limit_store_errors_total',
  help: 'Rate-limit store failures (requests fail closed)',
  registers: [registry],
});

export const dbErrors = new promClient.Counter({
  name: 'crm_db_errors_total',
  help: 'Database errors surfaced to request handling or the pool',
  labelNames: ['kind'],
  registers: [registry],
});

/** Pool gauges read at scrape time (no polling loop). */
export function registerPoolMetrics(pool: DatabasePool): void {
  new promClient.Gauge({
    name: 'crm_db_pool_connections',
    help: 'Database pool connections by state',
    labelNames: ['state'],
    registers: [registry],
    collect() {
      this.set({ state: 'total' }, pool.totalCount);
      this.set({ state: 'idle' }, pool.idleCount);
      this.set({ state: 'waiting' }, pool.waitingCount);
    },
  });
  pool.on('error', () => dbErrors.inc({ kind: 'pool' }));
}

export function metricsHandler(token: string | undefined): RequestHandler {
  return async (req, res) => {
    if (!token) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      return;
    }
    if (!metricsAuthorized(req.get('authorization'), token)) {
      res
        .status(401)
        .json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Unauthorized' } });
      return;
    }
    res.setHeader('Content-Type', registry.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(await registry.metrics());
  };
}
