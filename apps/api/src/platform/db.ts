import { createPool, type DatabasePool } from '@crm/database';
import { databaseSsl, env } from './env.js';
import { registerPoolMetrics } from './metrics.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Connection defaults and pg type parsers (INT8 -> number) live in @crm/database
// so the API, worker and migration runner share them.
export const pool: DatabasePool = createPool({
  connectionString: process.env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: databaseSsl(),
  applicationName: 'crm-api',
});

registerPoolMetrics(pool);

export default pool;
