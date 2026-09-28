import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const ADMIN_EMAIL = 'e2e-admin@example.test';
export const ADMIN_PASSWORD = 'E2eAdminPass123';

// Playwright runs from apps/web.
const repo = path.resolve(process.cwd(), '..', '..');

/**
 * Migrates the disposable database and creates two organizations (Alpha,
 * Beta) administered by the same identity, so organization switching can be
 * tested. Refuses to run without an explicit E2E_DATABASE_URL.
 */
export default async function globalSetup() {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error('Set E2E_DATABASE_URL to a disposable PostgreSQL database');
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  execFileSync(process.execPath, [path.join(repo, 'packages/database/dist/cli/migrate.js'), 'up'], {
    env,
    stdio: 'inherit',
  });
  for (const name of ['Alpha E2E', 'Beta E2E']) {
    execFileSync(
      process.execPath,
      [path.join(repo, 'apps/api/dist/cli/bootstrap-organization.js')],
      {
        env: {
          ...env,
          BOOTSTRAP_ORG_NAME: name,
          BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL,
          BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD,
          BOOTSTRAP_ADMIN_NAME: 'Erin Admin',
          JWT_SECRET: 'e2e-only-secret-0123456789abcdef0123456789abcdef',
        },
        stdio: 'inherit',
      },
    );
  }
}
