// Load and validate environment variables first (fails fast on missing keys).
import { env } from './platform/env.js';

import app from './app.js';
import { pool } from './platform/db.js';
import { markShuttingDown } from './platform/health.js';
import { logger } from './platform/logger.js';

const server = app.listen(env.PORT, () => {
  logger.info('server_started', { port: env.PORT });
});

// Graceful shutdown: fail readiness, stop accepting connections, then close the DB pool.
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server_stopping', { signal });
  markShuttingDown();

  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  server.close(() => {
    pool
      .end()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
