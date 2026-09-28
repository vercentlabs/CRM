import type { DatabasePool } from './pool.js';

export interface DatabaseHealth {
  ok: boolean;
  latencyMs: number;
}

/**
 * Runs `SELECT 1` with a hard timeout. Never returns error text, hostnames or
 * credentials, so the result is safe to expose from public health endpoints.
 */
export async function checkDatabase(
  pool: Pick<DatabasePool, 'query'>,
  { timeoutMs = 2_000 }: { timeoutMs?: number } = {},
): Promise<DatabaseHealth> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('database health check timed out')), timeoutMs);
      }),
    ]);
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch {
    return { ok: false, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}
