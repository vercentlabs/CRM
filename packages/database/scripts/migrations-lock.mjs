#!/usr/bin/env node
/**
 * Adds NEW migration files to migrations.lock.json. Existing entries are never
 * rewritten: a changed checksum for a locked file is an error (write a new
 * forward-only migration instead).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMigrations, MIGRATIONS_DIR } from '../dist/index.js';

const lockPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations.lock.json',
);
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
let added = 0;
for (const file of await loadMigrations(MIGRATIONS_DIR)) {
  if (!(file.filename in lock)) {
    lock[file.filename] = file.checksum;
    added += 1;
    console.log(`locked ${file.filename}`);
  } else if (lock[file.filename] !== file.checksum) {
    console.error(
      `${file.filename} changed after it was locked. Revert it and add a new migration.`,
    );
    process.exit(1);
  }
}
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
console.log(added ? `Added ${added} migration(s).` : 'Lock is up to date.');
