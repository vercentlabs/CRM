import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import type { DatabasePool } from '@crm/database';
import { passwordSchema } from '@crm/validation';

const DEFAULT_SETTINGS: Record<string, string> = {
  timezone: 'UTC',
  date_format: 'MM/DD/YYYY',
  time_format: '12h',
  items_per_page: '20',
  enable_notifications: 'true',
  maintenance_mode: 'false',
};

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63) || `org-${randomBytes(3).toString('hex')}`
  );
}

export interface BootstrapInput {
  organizationName: string;
  slug?: string | undefined;
  adminEmail: string;
  adminName?: string | undefined;
  /** Required only when the admin email does not exist yet. */
  adminPassword?: string | undefined;
}

export interface BootstrapResult {
  organizationPublicId: string;
  slug: string;
  reusedExistingUser: boolean;
}

/**
 * Creates an organization, its first administrator and default settings in
 * one transaction. Existing identities are reused without changing their
 * password. Weak passwords are refused.
 */
export async function bootstrapOrganization(
  pool: DatabasePool,
  input: BootstrapInput,
): Promise<BootstrapResult> {
  const slug = input.slug?.trim() || slugify(input.organizationName);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const org = await client.query(
      `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id, public_id`,
      [input.organizationName, slug],
    );
    const { id: organizationId, public_id: publicId } = org.rows[0];

    const existing = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [
      input.adminEmail,
    ]);
    let userId: number;
    const reusedExistingUser = Boolean(existing.rows[0]);
    if (existing.rows[0]) {
      userId = existing.rows[0].id;
    } else {
      const password = input.adminPassword ?? '';
      if (password.length < 12 || !passwordSchema.safeParse(password).success) {
        throw new Error(
          'The admin password must be at least 12 characters with letters and numbers',
        );
      }
      const base =
        input.adminEmail
          .split('@')[0]!
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, '') || 'admin';
      const created = await client.query(
        `INSERT INTO users (username, full_name, email, password_hash, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [
          `${base}-${randomBytes(2).toString('hex')}`,
          input.adminName || 'Administrator',
          input.adminEmail,
          await bcrypt.hash(password, 12),
        ],
      );
      userId = created.rows[0].id;
    }

    await client.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role_id, status, joined_at)
       SELECT $1, $2, r.id, 'active', now() FROM roles r
       WHERE r.key = 'admin' AND r.organization_id IS NULL`,
      [organizationId, userId],
    );

    for (const [key, value] of Object.entries({
      site_name: input.organizationName,
      ...DEFAULT_SETTINGS,
    })) {
      await client.query(`INSERT INTO settings (organization_id, key, value) VALUES ($1, $2, $3)`, [
        organizationId,
        key,
        value,
      ]);
    }

    await client.query('COMMIT');
    return { organizationPublicId: publicId, slug, reusedExistingUser };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
