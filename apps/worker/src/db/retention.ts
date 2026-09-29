import type { DatabasePool } from '@crm/database';

export interface RetentionWindows {
  sessionDays: number;
  passwordResetDays: number;
  notificationDays: number;
  deliveryDays: number;
  deletedFileDays: number;
}

export interface RetentionResult {
  sessions: number;
  refreshTokens: number;
  passwordResets: number;
  notifications: number;
  emailDeliveries: number;
  webhookDeliveries: number;
  deletedFiles: number;
}

/** Rows removed per statement: bounded so one sweep never holds long locks. */
const BATCH = 5000;

const purge = async (db: DatabasePool, table: string, where: string, days: number) => {
  const result = await db.query(
    `DELETE FROM ${table} WHERE id IN (
       SELECT id FROM ${table} WHERE ${where} LIMIT ${BATCH}
     )`,
    [days],
  );
  return result.rowCount ?? 0;
};

/**
 * Operational retention. Only security/transport records are purged — never
 * CRM business records (leads, customers, tasks, messages, calls, opportunities,
 * audit logs). Each category is bounded per run; the next sweep continues.
 */
export async function applyRetention(
  db: DatabasePool,
  windows: RetentionWindows,
): Promise<RetentionResult> {
  return {
    // Sessions that expired or were revoked long enough ago (their refresh tokens cascade).
    sessions: await purge(
      db,
      'auth_sessions',
      `(revoked_at IS NOT NULL AND revoked_at < now() - make_interval(days => $1))
        OR expires_at < now() - make_interval(days => $1)`,
      windows.sessionDays,
    ),
    // Expired refresh tokens of still-live sessions (an expired token can never be accepted or replayed).
    refreshTokens: await purge(
      db,
      'auth_refresh_tokens',
      'expires_at < now() - make_interval(days => $1)',
      windows.sessionDays,
    ),
    // Used or expired reset requests (reset links live for an hour). Same now() comparison as the API.
    passwordResets: await purge(
      db,
      'password_resets',
      '(used = true OR expires_at < now()) AND created_at < now() - make_interval(days => $1)',
      windows.passwordResetDays,
    ),
    // Only notifications the user already read; unread ones are kept.
    notifications: await purge(
      db,
      'notifications',
      'read_at IS NOT NULL AND read_at < now() - make_interval(days => $1)',
      windows.notificationDays,
    ),
    emailDeliveries: await purge(
      db,
      'email_deliveries',
      `status IN ('sent', 'failed') AND updated_at < now() - make_interval(days => $1)`,
      windows.deliveryDays,
    ),
    webhookDeliveries: await purge(
      db,
      'webhook_deliveries',
      `status IN ('delivered', 'failed', 'cancelled') AND updated_at < now() - make_interval(days => $1)`,
      windows.deliveryDays,
    ),
    // Metadata of deleted files whose provider object is confirmed gone.
    deletedFiles: await purge(
      db,
      'files',
      `status = 'deleted' AND provider_deleted_at IS NOT NULL
        AND provider_deleted_at < now() - make_interval(days => $1)`,
      windows.deletedFileDays,
    ),
  };
}
