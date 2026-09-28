import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkDatabase } from '../health.js';
import { MIGRATIONS_DIR } from '../paths.js';
import { createPool, type DatabasePool } from '../pool.js';
import {
  MigrationError,
  baseline,
  checksum,
  isDestructive,
  loadMigrations,
  migrate,
  migrationStatus,
} from './runner.js';

const silent = { info: () => undefined, warn: () => undefined };

async function tempMigrations(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'crm-migrations-'));
  for (const [name, sql] of Object.entries(files)) await writeFile(path.join(dir, name), sql);
  return dir;
}

describe('loadMigrations', () => {
  it('loads the shipped migrations in order', async () => {
    const files = await loadMigrations(MIGRATIONS_DIR);
    expect(files[0]?.filename).toBe('0001_baseline_schema.sql');
    expect(files.map((f) => f.version)).toEqual([...files.map((f) => f.version)].sort());
    expect(files.every((f) => !f.destructive || f.allowDestructive)).toBe(true);
  });

  it('sorts by version and rejects bad names and duplicates', async () => {
    const ok = await tempMigrations({ '0002_b.sql': 'SELECT 2;', '0001_a.sql': 'SELECT 1;' });
    expect((await loadMigrations(ok)).map((f) => f.filename)).toEqual(['0001_a.sql', '0002_b.sql']);

    const bad = await tempMigrations({ 'add-things.sql': 'SELECT 1;' });
    await expect(loadMigrations(bad)).rejects.toBeInstanceOf(MigrationError);

    const dup = await tempMigrations({ '0001_a.sql': 'SELECT 1;', '0001_b.sql': 'SELECT 1;' });
    await expect(loadMigrations(dup)).rejects.toThrow(/Duplicate migration version 0001/);
    await Promise.all([ok, bad, dup].map((dir) => rm(dir, { recursive: true, force: true })));
  });
});

describe('isDestructive', () => {
  it.each([
    'DROP TABLE leads;',
    'drop schema x cascade;',
    'ALTER TABLE leads DROP COLUMN notes;',
    'ALTER TABLE leads DROP notes;',
    'TRUNCATE audit_logs;',
    'DELETE FROM users;',
  ])('flags %s', (sql) => expect(isDestructive(sql)).toBe(true));

  it.each([
    'CREATE TABLE a (id int);',
    'ALTER TABLE leads DROP CONSTRAINT leads_pk;',
    'ALTER TABLE leads ALTER COLUMN x DROP NOT NULL;',
    'DROP TRIGGER IF EXISTS t ON leads;',
    '-- DROP TABLE leads;\nSELECT 1;',
  ])('allows %s', (sql) => expect(isDestructive(sql)).toBe(false));
});

describe('checksum', () => {
  it('ignores CRLF vs LF differences', () => {
    expect(checksum('a\r\nb')).toBe(checksum('a\nb'));
  });
});

/**
 * Integration tests run only when TEST_DATABASE_URL points at a disposable Postgres.
 * Each run works inside a throwaway schema via search_path.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('migrations against PostgreSQL', () => {
  const schema = `crm_migrate_test_${Date.now()}`;
  let admin: DatabasePool;
  let pool: DatabasePool;

  beforeAll(async () => {
    admin = createPool({ connectionString: TEST_DATABASE_URL!, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = createPool({
      connectionString: TEST_DATABASE_URL!,
      max: 2,
      options: `-c search_path=${schema}`,
    });
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it('applies the baseline to an empty database exactly once', async () => {
    const first = await migrate({ pool, dir: MIGRATIONS_DIR, logger: silent });
    expect(first.applied).toContain('0001_baseline_schema.sql');
    const second = await migrate({ pool, dir: MIGRATIONS_DIR, logger: silent });
    expect(second.applied).toEqual([]);

    const status = await migrationStatus({ pool, dir: MIGRATIONS_DIR });
    expect(status.every((row) => row.state === 'applied')).toBe(true);
    await expect(checkDatabase(pool)).resolves.toMatchObject({ ok: true });
  });

  it('rejects edited migrations', async () => {
    const files = await loadMigrations(MIGRATIONS_DIR);
    const edited = Object.fromEntries(files.map((f) => [f.filename, f.sql]));
    edited['0001_baseline_schema.sql'] += '\n-- edited';
    const dir = await tempMigrations(edited);
    await expect(migrate({ pool, dir, logger: silent })).rejects.toThrow(
      /modified after it was applied/,
    );
    await rm(dir, { recursive: true, force: true });
  });

  it('requires an explicit baseline for pre-existing databases', async () => {
    const legacySchema = `${schema}_legacy`;
    await admin.query(`CREATE SCHEMA ${legacySchema}`);
    const legacy = createPool({
      connectionString: TEST_DATABASE_URL!,
      max: 1,
      options: `-c search_path=${legacySchema}`,
    });
    try {
      await legacy.query('CREATE TABLE users (id serial primary key)');
      await expect(migrate({ pool: legacy, dir: MIGRATIONS_DIR, logger: silent })).rejects.toThrow(
        /no migration history/,
      );
      await baseline({ pool: legacy, dir: MIGRATIONS_DIR, version: '0001', logger: silent });
      const status = await migrationStatus({ pool: legacy, dir: MIGRATIONS_DIR });
      expect(status[0]).toMatchObject({ filename: '0001_baseline_schema.sql', state: 'baseline' });
    } finally {
      await legacy.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${legacySchema} CASCADE`);
    }
  });

  it('refuses destructive migrations without the review marker', async () => {
    const files = await loadMigrations(MIGRATIONS_DIR);
    const next = String(files.length + 1).padStart(4, '0');
    const withDrop = Object.fromEntries(files.map((f) => [f.filename, f.sql]));
    withDrop[`${next}_drop_notes.sql`] = 'DROP TABLE notes;';
    const dir = await tempMigrations(withDrop);
    await expect(migrate({ pool, dir, logger: silent })).rejects.toThrow(/destructive/);
    await rm(dir, { recursive: true, force: true });
  });
});
