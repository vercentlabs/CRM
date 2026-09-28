import type { DatabaseClient, DatabasePool } from './pool.js';

/** Anything that can run a parameterized query: the pool or a transaction client. */
export type Queryable = Pick<DatabasePool, 'query'> | DatabaseClient;

/**
 * Runs `fn` inside BEGIN/COMMIT on one pooled client and rolls back on any
 * error. Use for multi-statement workflows whose partial application would
 * leave inconsistent CRM state; single-row CRUD does not need it.
 */
export async function withTransaction<T>(
  pool: DatabasePool,
  fn: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
