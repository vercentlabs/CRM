import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseClient, DatabasePool } from '../pool.js';

/** `NNNN_snake_case_name.sql`, applied in ascending version order. */
export const MIGRATION_FILENAME = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/** Human-reviewed destructive migrations must contain this marker line. */
export const ALLOW_DESTRUCTIVE_MARKER = '-- crm:allow-destructive';
/** For statements that cannot run inside a transaction (e.g. CREATE INDEX CONCURRENTLY). */
export const NO_TRANSACTION_MARKER = '-- crm:no-transaction';

export const HISTORY_TABLE = 'schema_migrations';
const ADVISORY_LOCK_KEY = 72_410_001;

export interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
  destructive: boolean;
  allowDestructive: boolean;
  transactional: boolean;
}

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
  applied_at: Date;
  baseline: boolean;
}

export interface MigrationLogger {
  info(message: string): void;
  warn(message: string): void;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\bDROP\s+(TABLE|SCHEMA|DATABASE|COLUMN|MATERIALIZED\s+VIEW)\b/i,
  /\bALTER\s+TABLE\b[^;]*?\bDROP\s+(?!CONSTRAINT\b|DEFAULT\b|NOT\s+NULL\b|IDENTITY\b|EXPRESSION\b)/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
];

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Heuristic data-loss detector. False positives only require the explicit review marker. */
export function isDestructive(sql: string): boolean {
  const code = stripComments(sql);
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(code));
}

export function checksum(sql: string): string {
  // Normalise line endings so Windows checkouts produce the same checksum as Linux CI.
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

export async function loadMigrations(dir: string): Promise<MigrationFile[]> {
  const entries = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  const seen = new Map<string, string>();
  const migrations: MigrationFile[] = [];

  for (const filename of entries) {
    const match = MIGRATION_FILENAME.exec(filename);
    if (!match) {
      throw new MigrationError(
        `Invalid migration filename "${filename}". Expected NNNN_snake_case_name.sql`,
      );
    }
    const [, version, name] = match as unknown as [string, string, string];
    const duplicate = seen.get(version);
    if (duplicate) {
      throw new MigrationError(
        `Duplicate migration version ${version}: ${duplicate} and ${filename}`,
      );
    }
    seen.set(version, filename);

    const sql = await readFile(path.join(dir, filename), 'utf8');
    const lines = sql.split(/\r?\n/).map((line) => line.trim());
    migrations.push({
      version,
      name,
      filename,
      sql,
      checksum: checksum(sql),
      destructive: isDestructive(sql),
      allowDestructive: lines.includes(ALLOW_DESTRUCTIVE_MARKER),
      transactional: !lines.includes(NO_TRANSACTION_MARKER),
    });
  }
  return migrations;
}

async function ensureHistoryTable(client: DatabaseClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} (
      version      TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      checksum     TEXT NOT NULL,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      execution_ms INTEGER,
      applied_by   TEXT NOT NULL DEFAULT current_user,
      baseline     BOOLEAN NOT NULL DEFAULT false
    )
  `);
}

async function readHistory(client: DatabaseClient): Promise<AppliedMigration[]> {
  const result = await client.query<AppliedMigration>(
    `SELECT version, name, checksum, applied_at, baseline FROM ${HISTORY_TABLE} ORDER BY version`,
  );
  return result.rows;
}

async function withLock<T>(pool: DatabasePool, fn: (client: DatabaseClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    try {
      await ensureHistoryTable(client);
      return await fn(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

/** Fails if an applied migration was edited or deleted locally, or if ordering was violated. */
function verifyHistory(files: MigrationFile[], applied: AppliedMigration[]): MigrationFile[] {
  const byVersion = new Map(files.map((file) => [file.version, file]));
  for (const row of applied) {
    const file = byVersion.get(row.version);
    if (!file) {
      throw new MigrationError(
        `Migration ${row.version}_${row.name} is recorded as applied but its file is missing.`,
      );
    }
    if (file.checksum !== row.checksum) {
      throw new MigrationError(
        `Migration ${file.filename} was modified after it was applied. ` +
          'Applied migrations are immutable; add a new migration instead.',
      );
    }
  }

  const appliedVersions = new Set(applied.map((row) => row.version));
  const pending = files.filter((file) => !appliedVersions.has(file.version));
  const latestApplied = applied.at(-1)?.version;
  const outOfOrder = latestApplied
    ? pending.find((file) => file.version < latestApplied)
    : undefined;
  if (outOfOrder) {
    throw new MigrationError(
      `Migration ${outOfOrder.filename} is older than the latest applied version ${latestApplied}. ` +
        'Renumber it so it sorts after the latest applied migration.',
    );
  }
  return pending;
}

async function looksLikeUntrackedDatabase(client: DatabaseClient): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT to_regclass('users') IS NOT NULL AS exists`,
  );
  return Boolean(result.rows[0]?.exists);
}

export interface MigrateOptions {
  pool: DatabasePool;
  dir: string;
  logger?: MigrationLogger;
}

export interface MigrateResult {
  applied: string[];
}

/** Applies pending migrations in order, each inside its own transaction. Forward-only. */
export async function migrate({
  pool,
  dir,
  logger = console,
}: MigrateOptions): Promise<MigrateResult> {
  const files = await loadMigrations(dir);

  return withLock(pool, async (client) => {
    const history = await readHistory(client);
    if (history.length === 0 && (await looksLikeUntrackedDatabase(client))) {
      throw new MigrationError(
        'This database already contains CRM tables but has no migration history. ' +
          'Verify it matches migrations/0001_baseline_schema.sql, then run `pnpm db:migrate:baseline` once.',
      );
    }

    const pending = verifyHistory(files, history);
    const blocked = pending.filter((file) => file.destructive && !file.allowDestructive);
    if (blocked.length > 0) {
      throw new MigrationError(
        `Refusing to run potentially destructive migration(s): ${blocked.map((f) => f.filename).join(', ')}. ` +
          `After human review, add a "${ALLOW_DESTRUCTIVE_MARKER}" line to the file.`,
      );
    }

    if (pending.length === 0) {
      logger.info('Database is up to date.');
      return { applied: [] };
    }

    const applied: string[] = [];
    for (const file of pending) {
      const startedAt = Date.now();
      logger.info(`Applying ${file.filename}...`);
      try {
        if (file.transactional) await client.query('BEGIN');
        await client.query(file.sql);
        await client.query(
          `INSERT INTO ${HISTORY_TABLE} (version, name, checksum, execution_ms) VALUES ($1, $2, $3, $4)`,
          [file.version, file.name, file.checksum, Date.now() - startedAt],
        );
        if (file.transactional) await client.query('COMMIT');
      } catch (error) {
        if (file.transactional) await client.query('ROLLBACK').catch(() => undefined);
        const reason = error instanceof Error ? error.message : String(error);
        throw new MigrationError(`Migration ${file.filename} failed: ${reason}`);
      }
      applied.push(file.filename);
      logger.info(`Applied ${file.filename} in ${Date.now() - startedAt}ms`);
    }
    return { applied };
  });
}

export interface MigrationStatusEntry {
  filename: string;
  state: 'applied' | 'baseline' | 'pending';
  appliedAt?: Date;
}

export async function migrationStatus({ pool, dir }: Omit<MigrateOptions, 'logger'>) {
  const files = await loadMigrations(dir);
  return withLock(pool, async (client) => {
    const history = await readHistory(client);
    verifyHistory(files, history);
    const byVersion = new Map(history.map((row) => [row.version, row]));
    return files.map((file): MigrationStatusEntry => {
      const row = byVersion.get(file.version);
      if (!row) return { filename: file.filename, state: 'pending' };
      return {
        filename: file.filename,
        state: row.baseline ? 'baseline' : 'applied',
        appliedAt: row.applied_at,
      };
    });
  });
}

/**
 * Records migrations up to and including `version` as applied WITHOUT executing them.
 * Only for databases created before the migration system existed (schema managed via pgAdmin).
 */
export async function baseline({
  pool,
  dir,
  version,
  logger = console,
}: MigrateOptions & { version: string }): Promise<MigrateResult> {
  const files = await loadMigrations(dir);
  if (!files.some((file) => file.version === version)) {
    throw new MigrationError(`No migration with version ${version} exists.`);
  }
  return withLock(pool, async (client) => {
    const history = await readHistory(client);
    if (history.length > 0) {
      throw new MigrationError('Baseline is only allowed on a database with no migration history.');
    }
    const marked: string[] = [];
    for (const file of files.filter((f) => f.version <= version)) {
      await client.query(
        `INSERT INTO ${HISTORY_TABLE} (version, name, checksum, baseline) VALUES ($1, $2, $3, true)`,
        [file.version, file.name, file.checksum],
      );
      marked.push(file.filename);
      logger.info(`Marked ${file.filename} as applied (baseline).`);
    }
    return { applied: marked };
  });
}
