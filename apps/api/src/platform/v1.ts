import type { DatabasePool } from '@crm/database';
import { Router } from 'express';
import { createHealthRouter } from './health.js';
import { notFoundHandler } from './http/error-handler.js';

/**
 * Versioned API surface, mounted at `/api/v1`.
 * Domain modules move here route-by-route in Phase 3; legacy unversioned
 * routes stay mounted until every web/mobile caller has migrated.
 */
export function createV1Router({ pool }: { pool: Pick<DatabasePool, 'query'> }): Router {
  const router = Router();
  router.use('/health', createHealthRouter(pool));
  router.use(notFoundHandler);
  return router;
}
