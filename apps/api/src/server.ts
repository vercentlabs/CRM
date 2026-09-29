// Load and validate environment variables first (fails fast on unsafe production configuration).
import { env } from './platform/env.js';

import { buildInfo } from '@crm/observability';
import app from './app.js';
import { pool } from './platform/db.js';
import { markShuttingDown } from './platform/health.js';
import { errorFields, logger } from './platform/logger.js';
import { rateLimitStore } from './platform/rate-limit.js';

const server = app.listen(env.PORT, () => {
  logger.info('server_started', { port: env.PORT, ...buildInfo() });
});
// Keep-alive longer than typical load-balancer idle timeouts to avoid 502s on reuse.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

const DRAIN_MS = Number(process.env.SHUTDOWN_DRAIN_MS ?? 5_000);
const FORCE_EXIT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 25_000);

/**
 * Graceful shutdown for rolling deploys:
 * 1. readiness fails immediately (load balancer stops routing new requests);
 * 2. after SHUTDOWN_DRAIN_MS the listener closes and in-flight requests finish;
 * 3. the rate-limit store and the database pool close; exit 0.
 * A hard exit after SHUTDOWN_TIMEOUT_MS bounds the whole sequence.
 */
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server_stopping', { signal, drainMs: DRAIN_MS });
  markShuttingDown();

  const forceExit = setTimeout(() => {
    logger.error('server_forced_exit', { signal });
    process.exit(1);
  }, FORCE_EXIT_MS);
  forceExit.unref();

  setTimeout(() => {
    server.close(() => {
      Promise.allSettled([rateLimitStore().close(), pool.end()])
        .then(() => logger.info('server_stopped', { signal }))
        .finally(() => process.exit(0));
    });
    server.closeIdleConnections?.();
  }, DRAIN_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', errorFields(reason, true));
});
