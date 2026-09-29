import { buildInfo, logErrorReporter, setErrorReporter } from '@crm/observability';
import express from 'express';
import { apiModules, createWebhookRouter } from './modules/index.js';
import { corsMiddleware } from './platform/cors.js';
import { pool } from './platform/db.js';
import { env } from './platform/env.js';
import { accessLog } from './platform/http/access-log.js';
import { errorHandler, notFoundHandler } from './platform/http/error-handler.js';
import { apiResponseDefaults, securityHeaders } from './platform/http/security.js';
import { logger } from './platform/logger.js';
import { metricsHandler } from './platform/metrics.js';
import { requestContextMiddleware } from './platform/request-context.js';
import { createV1Router } from './platform/v1.js';

/**
 * Composition only: request context → access log/metrics → security headers →
 * body parsing (bounded) → CORS → /metrics (token) → /api/v1 → provider
 * webhooks → JSON 404 → error handling.
 */
const app = express();
const build = buildInfo();

// Errors go to structured logs unless a vendor adapter is installed at startup.
setErrorReporter(logErrorReporter(logger));

app.disable('x-powered-by');
if (env.TRUST_PROXY) {
  // Behind a reverse proxy, req.ip (rate limiting, audit) must be the client address.
  app.set('trust proxy', /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY);
}

app.use(requestContextMiddleware);
app.use(accessLog({ slowMs: env.SLOW_REQUEST_MS }));
app.use(securityHeaders(env.NODE_ENV === 'production'));
app.use(express.json({ limit: env.BODY_LIMIT }));
app.use(corsMiddleware);

app.get('/metrics', metricsHandler(env.METRICS_TOKEN));
app.use(
  '/api/v1',
  apiResponseDefaults(build),
  createV1Router({ pool, modules: apiModules, build }),
);
app.use(createWebhookRouter());
app.use(notFoundHandler);

app.use(errorHandler);

export default app;
