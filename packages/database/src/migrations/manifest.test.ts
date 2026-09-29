import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../paths.js';
import { loadMigrations } from './runner.js';

/**
 * Applied migrations are immutable: migrations.lock.json records the checksum
 * of every migration file. Editing an existing file (instead of adding a new,
 * forward-only migration) fails here — and would fail `migrate` on every
 * database that already applied it. New migrations are added to the lock with
 * `pnpm --filter @crm/database migrations:lock`.
 */
const lock: Record<string, string> = JSON.parse(
  readFileSync(path.resolve(MIGRATIONS_DIR, '..', 'migrations.lock.json'), 'utf8'),
);

describe('migration manifest', () => {
  it('matches every migration file exactly (no edits to applied migrations)', async () => {
    const files = await loadMigrations(MIGRATIONS_DIR);
    expect(Object.fromEntries(files.map((f) => [f.filename, f.checksum]))).toEqual(lock);
  });

  it('numbers migrations contiguously from 0001', async () => {
    const versions = (await loadMigrations(MIGRATIONS_DIR)).map((f) => Number(f.version));
    expect(versions).toEqual(versions.map((_, i) => i + 1));
  });
});
