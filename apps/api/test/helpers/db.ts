import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MIGRATIONS_DIR, createPool, migrate, type DatabasePool } from '@crm/database';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasTestDatabase = Boolean(TEST_DATABASE_URL);

const silent = { info: () => undefined, warn: () => undefined };

export interface TestSchema {
  schema: string;
  /** Connection string that pins search_path to the schema (used as DATABASE_URL for the app). */
  url: string;
  pool: DatabasePool;
  migrateAll(): Promise<void>;
  drop(): Promise<void>;
}

function withSearchPath(url: string, schema: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
}

async function migrationsUpTo(version: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'crm-migrations-'));
  for (const file of await readdir(MIGRATIONS_DIR)) {
    if (file.endsWith('.sql') && file.slice(0, 4) <= version) {
      await copyFile(path.join(MIGRATIONS_DIR, file), path.join(dir, file));
    }
  }
  return dir;
}

/**
 * Creates a throwaway schema in TEST_DATABASE_URL and applies migrations up to
 * `upTo` (default: all). Every test file gets its own schema, so files can run
 * in parallel without seeing each other's data.
 */
export async function createTestSchema(
  prefix: string,
  { upTo }: { upTo?: string } = {},
): Promise<TestSchema> {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set');
  const schema = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = createPool({ connectionString: TEST_DATABASE_URL, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();

  const url = withSearchPath(TEST_DATABASE_URL, schema);
  const pool = createPool({ connectionString: url, max: 4 });

  const runMigrations = async (dir: string) => migrate({ pool, dir, logger: silent });
  if (upTo) {
    const dir = await migrationsUpTo(upTo);
    await runMigrations(dir);
    await rm(dir, { recursive: true, force: true });
  } else {
    await runMigrations(MIGRATIONS_DIR);
  }

  return {
    schema,
    url,
    pool,
    migrateAll: async () => {
      await runMigrations(MIGRATIONS_DIR);
    },
    drop: async () => {
      await pool.end();
      const cleanup = createPool({ connectionString: TEST_DATABASE_URL, max: 1 });
      await cleanup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await cleanup.end();
    },
  };
}
