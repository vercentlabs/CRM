// Load and validate environment variables first (fails fast on missing keys)
import { env } from './platform/env.js';

import app from './app.js';
import pool from './config/db.js';
import { markShuttingDown } from './platform/health.js';

// Start the server
const server = app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});

// Graceful shutdown: fail readiness, stop accepting connections, then close the DB pool
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  markShuttingDown();

  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();

  server.close(async () => {
    await pool.end().catch(() => undefined);
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
