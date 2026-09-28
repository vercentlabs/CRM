import pg from 'pg';

const { Pool, types } = pg;

export type DatabasePool = pg.Pool;
export type DatabaseClient = pg.PoolClient;

export interface CreatePoolOptions {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  /** Extra libpq options, e.g. `-c search_path=...` (used by tests). */
  options?: string;
  applicationName?: string;
}

let parsersConfigured = false;

/**
 * Registers the process-wide pg type parsers the CRM relies on: INT8 (bigint,
 * e.g. COUNT(*)) is returned as a JS number instead of a string.
 *
 * The pre-Phase-1 API also registered a custom TEXT[] parser, but it keyed it on
 * `types.builtins.TEXT_ARRAY`, which does not exist, so it never ran. TEXT[] has
 * always used pg's built-in array parser; that behaviour is kept deliberately.
 */
export function configureTypeParsers(): void {
  if (parsersConfigured) return;
  types.setTypeParser(types.builtins.INT8, (value: string) => parseInt(value, 10));
  parsersConfigured = true;
}

/** Creates a pool with the CRM's defaults (same values the API used before Phase 1). */
export function createPool(options: CreatePoolOptions): DatabasePool {
  if (!options.connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  configureTypeParsers();
  return new Pool({
    connectionString: options.connectionString,
    max: options.max ?? 20,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10_000,
    ...(options.options ? { options: options.options } : {}),
    ...(options.applicationName ? { application_name: options.applicationName } : {}),
  });
}
