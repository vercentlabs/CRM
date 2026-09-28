#!/usr/bin/env node
/**
 * Creates an organization and its first administrator.
 *
 *   BOOTSTRAP_ORG_NAME="Acme" BOOTSTRAP_ADMIN_EMAIL=owner@acme.test \
 *   BOOTSTRAP_ADMIN_PASSWORD='<strong password>' pnpm org:bootstrap
 *
 * Credentials come only from the environment; nothing is hard-coded or printed.
 * An existing admin email is reused unchanged (its password is NOT modified).
 * Intended for operators (local or production); weak passwords are refused.
 */
import 'dotenv/config';
import { createPool } from '@crm/database';
import { bootstrapOrganization } from '../modules/organizations/organizations.bootstrap.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const pool = createPool({
    connectionString: required('DATABASE_URL'),
    max: 1,
    applicationName: 'crm-org-bootstrap',
  });
  try {
    const organizationName = required('BOOTSTRAP_ORG_NAME');
    const adminEmail = required('BOOTSTRAP_ADMIN_EMAIL');
    const result = await bootstrapOrganization(pool, {
      organizationName,
      slug: process.env.BOOTSTRAP_ORG_SLUG,
      adminEmail,
      adminName: process.env.BOOTSTRAP_ADMIN_NAME,
      adminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    });
    if (result.reusedExistingUser) {
      console.log('Admin email already existed; reused that identity (password unchanged).');
    }
    console.log(
      `Created organization "${organizationName}" (slug: ${result.slug}, id: ${result.organizationPublicId}) with admin ${adminEmail}.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const code = (error as { code?: string }).code;
  console.error(
    code === '23505'
      ? 'An organization with this slug already exists (set BOOTSTRAP_ORG_SLUG).'
      : error instanceof Error
        ? error.message
        : error,
  );
  process.exit(1);
});
