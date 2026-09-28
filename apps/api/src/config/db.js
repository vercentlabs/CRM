import { createPool } from '@crm/database';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Connection defaults and pg type parsers (INT8 -> number, TEXT[] -> string[])
// live in @crm/database so the API, worker and migration runner share them.
const pool = createPool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export default pool;
