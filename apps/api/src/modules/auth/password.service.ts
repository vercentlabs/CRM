import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { withTransaction, type Queryable } from '@crm/database';
import email from '../../integrations/email.js';
import { recordAuditEvent } from '../../platform/audit.js';
import { revokeUserSessions } from '../../platform/auth/repository.js';
import { pool } from '../../platform/db.js';
import { env } from '../../platform/env.js';
import { AppError } from '../../platform/http/errors.js';
import { errorFields, logger } from '../../platform/logger.js';

/**
 * Password reset for identities (platform-level, not tenant-owned): tokens
 * are stored hashed, expire after one hour, are single use, and a reset
 * revokes every session of the user. Responses never reveal whether an
 * email is registered.
 */

const RESET_TTL_MS = 60 * 60 * 1000;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

async function findIdentityByEmail(db: Queryable, address: string) {
  const result = await db.query('SELECT id, email FROM users WHERE lower(email) = lower($1)', [
    address,
  ]);
  return (result.rows[0] as { id: number; email: string } | undefined) ?? null;
}

export async function requestReset(address: string): Promise<void> {
  const user = await findIdentityByEmail(pool, address);
  if (!user) return;
  const token = randomBytes(32).toString('hex');
  await pool.query(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, hashToken(token), new Date(Date.now() + RESET_TTL_MS)],
  );
  try {
    const sent = await email.sendPasswordResetEmail(
      user.email,
      token,
      env.FRONTEND_URL ?? 'http://localhost:3000',
    );
    if (!sent) logger.warn('password_reset_email_not_sent');
  } catch (error) {
    logger.error('password_reset_email_failed', errorFields(error));
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const userId = await withTransaction(pool, async (client) => {
    const used = await client.query(
      `UPDATE password_resets SET used = true
       WHERE token_hash = $1 AND expires_at > NOW() AND used = false
       RETURNING user_id`,
      [hashToken(token)],
    );
    const id: number | undefined = used.rows[0]?.user_id;
    if (id === undefined) throw AppError.badRequest('Invalid or expired reset token');
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
    await revokeUserSessions(id, 'password_reset', undefined, client);
    return id;
  });
  await recordAuditEvent({
    organizationId: null,
    userId,
    action: 'PASSWORD_RESET',
    tableName: 'users',
    recordId: userId,
  });
}

export async function verifyResetToken(token: string): Promise<void> {
  const result = await pool.query(
    'SELECT 1 FROM password_resets WHERE token_hash = $1 AND expires_at > NOW() AND used = false',
    [hashToken(token)],
  );
  if (result.rows.length === 0) throw AppError.badRequest('Invalid or expired reset token');
}
