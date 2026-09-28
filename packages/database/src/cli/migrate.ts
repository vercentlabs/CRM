#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../pool.js';
import { MigrationError, baseline, migrate, migrationStatus } from '../migrations/runner.js';
import { MIGRATIONS_DIR } from '../paths.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');

/** DATABASE_URL comes from the environment, a local .env, or apps/api/.env (the API's config). */
function loadEnv(): void {
  for (const file of [path.resolve('.env'), path.join(repoRoot, 'apps/api/.env')]) {
    if (process.env.DATABASE_URL) return;
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

async function main(): Promise<void> {
  const [command = 'up', arg] = process.argv.slice(2);
  loadEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new MigrationError(
      'DATABASE_URL is not set (checked environment, ./.env and apps/api/.env).',
    );
  }

  const pool = createPool({ connectionString, max: 1, applicationName: 'crm-migrate' });
  try {
    switch (command) {
      case 'up': {
        const { applied } = await migrate({ pool, dir: MIGRATIONS_DIR });
        console.log(
          applied.length ? `Applied ${applied.length} migration(s).` : 'Nothing to apply.',
        );
        break;
      }
      case 'status': {
        const rows = await migrationStatus({ pool, dir: MIGRATIONS_DIR });
        for (const row of rows) {
          const when = row.appliedAt ? ` (${row.appliedAt.toISOString()})` : '';
          console.log(`${row.state.padEnd(8)} ${row.filename}${when}`);
        }
        break;
      }
      case 'baseline': {
        await baseline({ pool, dir: MIGRATIONS_DIR, version: arg ?? '0001' });
        break;
      }
      default:
        throw new MigrationError(
          `Unknown command "${command}". Use: up | status | baseline [version]`,
        );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof MigrationError ? error.message : error);
  process.exit(1);
});
