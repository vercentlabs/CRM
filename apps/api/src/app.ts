import express from 'express';
import { apiModules, createWebhookRouter } from './modules/index.js';
import { corsMiddleware } from './platform/cors.js';
import { pool } from './platform/db.js';
import { env } from './platform/env.js';
import { errorHandler, notFoundHandler } from './platform/http/error-handler.js';
import { requestContextMiddleware } from './platform/request-context.js';
import { createV1Router } from './platform/v1.js';

/**
 * Composition only: global middleware → /api/v1 → provider webhooks →
 * JSON 404 → error handling. The pre-v1 (unversioned) routes were removed in
 * Phase 5; they now answer 404.
 */
const app = express();

app.disable('x-powered-by');
if (env.TRUST_PROXY) {
  // Behind a reverse proxy, req.ip (rate limiting, audit) must be the client address.
  app.set('trust proxy', /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY);
}

app.use(requestContextMiddleware);
app.use(express.json());
app.use(corsMiddleware);

app.use('/api/v1', createV1Router({ pool, modules: apiModules }));
app.use(createWebhookRouter());
app.use(notFoundHandler);

app.use(errorHandler);

export default app;
