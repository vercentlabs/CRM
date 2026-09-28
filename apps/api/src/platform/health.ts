import { checkDatabase, type DatabasePool } from '@crm/database';
import type { HealthLiveData, HealthReadyData } from '@crm/types';
import { Router } from 'express';
import { sendData } from './http/respond.js';

let shuttingDown = false;

/** Called on SIGTERM so load balancers stop routing traffic before the server closes. */
export function markShuttingDown(): void {
  shuttingDown = true;
}

/**
 * `/api/v1/health/live`  – process is up (no dependencies checked).
 * `/api/v1/health/ready` – process can serve traffic (database reachable, not draining).
 * Responses contain status and latency only: no hostnames, versions or error text.
 */
export function createHealthRouter(pool: Pick<DatabasePool, 'query'>): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    const data: HealthLiveData = {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
    sendData(res, data);
  });

  router.get('/ready', async (_req, res) => {
    const database = await checkDatabase(pool);
    const ready = database.ok && !shuttingDown;
    const data: HealthReadyData = {
      status: ready ? 'ok' : 'unavailable',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: database.ok ? 'ok' : 'unavailable', latencyMs: database.latencyMs },
        ...(shuttingDown ? { process: { status: 'unavailable' as const } } : {}),
      },
    };
    res.setHeader('Cache-Control', 'no-store');
    sendData(res, data, { status: ready ? 200 : 503 });
  });

  return router;
}

/** DEPRECATED `GET /health` (historical shape) — use /api/v1/health/live|ready. */
export function legacyHealthRouter(): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.setHeader('Deprecation', 'true');
    res.json({ status: 'OK', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });
  return router;
}
