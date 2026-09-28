import { createPool, type DatabasePool } from '@crm/database';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Connection defaults and pg type parsers (INT8 -> number) live in @crm/database
// so the API, worker and migration runner share them.
export const pool: DatabasePool = createPool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export default pool;
