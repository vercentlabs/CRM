import type { DatabasePool } from '@crm/database';
import { Router } from 'express';
import { createAuthRouter } from './auth/routes.js';
import { createHealthRouter } from './health.js';
import { notFoundHandler } from './http/error-handler.js';
import {
  createCurrentOrganizationRouter,
  createOrganizationsRouter,
} from './organizations/routes.js';

/**
 * Versioned API surface, mounted at `/api/v1`.
 * Domain modules move here route-by-route in Phase 3; legacy unversioned
 * routes stay mounted (tenant-safe since Phase 2) until clients migrate.
 */
export function createV1Router({ pool }: { pool: Pick<DatabasePool, 'query'> }): Router {
  const router = Router();
  router.use('/health', createHealthRouter(pool));
  router.use('/auth', createAuthRouter());
  router.use('/organizations', createOrganizationsRouter());
  router.use('/organization', createCurrentOrganizationRouter());
  router.use(notFoundHandler);
  return router;
}
