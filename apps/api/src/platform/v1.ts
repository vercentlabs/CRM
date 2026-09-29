import type { DatabasePool } from '@crm/database';
import type { BuildInfo } from '@crm/observability';
import { API_V1_PREFIX, type ApiMetadata } from '@crm/types';
import { Router } from 'express';
import { createHealthRouter } from './health.js';
import { notFoundHandler } from './http/error-handler.js';
import { buildOpenApiDocument } from './http/openapi.js';
import { sendData } from './http/respond.js';
import { mountModules, type ApiModule } from './http/route.js';

export const API_NAME = 'CRM API';
export const API_VERSION = '1.0.0';

/**
 * Versioned API surface, mounted at `/api/v1`: health, metadata, the OpenAPI
 * document and every registered module. Unknown paths get the v1 404 envelope.
 */
export function createV1Router({
  pool,
  modules,
  build,
}: {
  pool: Pick<DatabasePool, 'query'>;
  modules: ApiModule[];
  build?: BuildInfo;
}): Router {
  const router = Router();
  const metadata: ApiMetadata = {
    name: API_NAME,
    version: API_VERSION,
    openapi: `${API_V1_PREFIX}/openapi.json`,
    ...(build ? { build: { version: build.version, commit: build.commit } } : {}),
  };
  let openApi: unknown;

  router.get('/', (_req, res) => {
    sendData(res, metadata);
  });
  router.get('/openapi.json', (_req, res) => {
    openApi ??= buildOpenApiDocument(modules, {
      title: API_NAME,
      version: API_VERSION,
      serverUrl: API_V1_PREFIX,
    });
    res.json(openApi);
  });
  router.use('/health', createHealthRouter(pool));
  mountModules(router, modules);
  router.use(notFoundHandler);
  return router;
}
