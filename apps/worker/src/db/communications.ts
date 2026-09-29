import type { Queryable } from '@crm/database';

/** Lead message delivery state (always bound to the organization). */

export interface OutgoingMessage {
  id: number;
  status: 'Queued' | 'Sending' | 'Sent' | 'Delivered' | 'Failed';
  /** True while another attempt is inside its send lease (still talking to the provider). */
  sending_in_progress: boolean;
  message_type: 'SMS' | 'WhatsApp' | 'Email';
  content: string;
  phone: string | null;
}

/**
 * Longest time one send attempt may hold a message in 'Sending' (provider
 * timeout 15s plus margin). Younger 'Sending' rows belong to a live attempt.
 */
export const SEND_LEASE_SECONDS = 60;

export async function lockMessage(
  db: Queryable,
  organizationId: number,
  messageId: number,
): Promise<OutgoingMessage | null> {
  const result = await db.query(
    `SELECT m.id, m.status, m.message_type, m.content,
            (m.status = 'Sending' AND m.sending_started_at > now() - make_interval(secs => ${SEND_LEASE_SECONDS}))
              AS sending_in_progress,
            COALESCE(NULLIF(l.mobile_number, ''), l.alternate_number) AS phone
     FROM messages m
     JOIN leads l ON l.id = m.lead_id AND l.organization_id = m.organization_id
     WHERE m.id = $1 AND m.organization_id = $2
     FOR UPDATE OF m`,
    [messageId, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function markSending(
  db: Queryable,
  organizationId: number,
  messageId: number,
  provider: string,
) {
  await db.query(
    `UPDATE messages SET status = 'Sending', sending_started_at = now(), attempts = attempts + 1,
                         provider = $3, failure_code = NULL, failure_message = NULL
     WHERE id = $1 AND organization_id = $2 AND status = 'Queued'`,
    [messageId, organizationId, provider],
  );
}

/** Provider accepted the message. Returns false if the state moved on meanwhile. */
export async function markSent(
  db: Queryable,
  organizationId: number,
  messageId: number,
  providerMessageId: string,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE messages SET status = 'Sent', sent_at = now(), provider_message_id = $3
     WHERE id = $1 AND organization_id = $2 AND status = 'Sending'`,
    [messageId, organizationId, providerMessageId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markFailed(
  db: Queryable,
  organizationId: number,
  messageId: number,
  failure: { code: string; message: string },
) {
  await db.query(
    `UPDATE messages SET status = 'Failed', failed_at = now(), failure_code = $3, failure_message = $4
     WHERE id = $1 AND organization_id = $2 AND status IN ('Queued', 'Sending')`,
    [messageId, organizationId, failure.code.slice(0, 50), failure.message.slice(0, 300)],
  );
}

/**
 * Maintenance: messages stuck in 'Sending' past the lease (the worker died
 * mid-call). The provider may have accepted them, so they are failed as
 * DELIVERY_UNKNOWN instead of being resent. Platform scan across tenants.
 */
export async function failStaleSending(db: Queryable): Promise<number> {
  const result = await db.query(
    `UPDATE messages SET status = 'Failed', failed_at = now(), failure_code = 'DELIVERY_UNKNOWN',
            failure_message = 'A send attempt was interrupted; not resent to avoid a duplicate'
     WHERE status = 'Sending'
       AND (sending_started_at IS NULL OR sending_started_at < now() - make_interval(secs => $1))`,
    [SEND_LEASE_SECONDS],
  );
  return result.rowCount ?? 0;
}

/** Transient provider failure: back to Queued for the next attempt. */
export async function requeue(
  db: Queryable,
  organizationId: number,
  messageId: number,
  failureCode: string,
) {
  await db.query(
    `UPDATE messages SET status = 'Queued', failure_code = $3
     WHERE id = $1 AND organization_id = $2 AND status = 'Sending'`,
    [messageId, organizationId, failureCode.slice(0, 50)],
  );
}

// ---------------------------------------------------------------- email deliveries

export interface EmailDelivery {
  id: number;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
}

/** One row per logical email; returns it locked for this transaction. */
export async function lockEmailDelivery(
  db: Queryable,
  input: {
    organizationId: number | null;
    kind: 'password_reset' | 'member_invitation';
    dedupeKey: string;
    recipientUserId: number;
  },
): Promise<EmailDelivery> {
  await db.query(
    `INSERT INTO email_deliveries (organization_id, kind, dedupe_key, recipient_user_id)
     VALUES ($1, $2, $3, $4) ON CONFLICT (dedupe_key) DO NOTHING`,
    [input.organizationId, input.kind, input.dedupeKey, input.recipientUserId],
  );
  const result = await db.query(
    `SELECT id, status, attempts FROM email_deliveries WHERE dedupe_key = $1 FOR UPDATE`,
    [input.dedupeKey],
  );
  return result.rows[0];
}

export async function setEmailDelivery(
  db: Queryable,
  id: number,
  change:
    | { status: 'sending' }
    | { status: 'sent'; providerMessageId: string | null }
    | { status: 'pending' | 'failed'; failureCode: string },
) {
  if (change.status === 'sending') {
    await db.query(
      `UPDATE email_deliveries SET status = 'sending', attempts = attempts + 1, updated_at = now() WHERE id = $1`,
      [id],
    );
  } else if (change.status === 'sent') {
    await db.query(
      `UPDATE email_deliveries SET status = 'sent', sent_at = now(), provider_message_id = $2,
                                   failure_code = NULL, updated_at = now() WHERE id = $1`,
      [id, change.providerMessageId],
    );
  } else {
    await db.query(
      `UPDATE email_deliveries SET status = $2::varchar, failure_code = $3,
                                   failed_at = CASE WHEN $2::varchar = 'failed' THEN now() ELSE failed_at END,
                                   updated_at = now() WHERE id = $1`,
      [id, change.status, change.failureCode.slice(0, 50)],
    );
  }
}

// ---------------------------------------------------------------- recipients

export interface PasswordResetTarget {
  id: number;
  user_id: number;
  email: string;
}

/** A pending (unused, unexpired) reset request with its recipient; locked. */
export async function lockPasswordReset(
  db: Queryable,
  id: number,
): Promise<PasswordResetTarget | null> {
  const result = await db.query(
    `SELECT pr.id, pr.user_id, u.email FROM password_resets pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.id = $1 AND pr.used = false AND pr.expires_at > NOW() AND COALESCE(u.is_active, true)
     FOR UPDATE OF pr`,
    [id],
  );
  return result.rows[0] ?? null;
}

/** Stores only the hash of the token that is about to be emailed (NULL invalidates). */
export async function setResetTokenHash(db: Queryable, id: number, tokenHash: string | null) {
  await db.query('UPDATE password_resets SET token_hash = $2 WHERE id = $1', [id, tokenHash]);
}

export async function markResetEmailed(db: Queryable, id: number) {
  await db.query('UPDATE password_resets SET email_sent_at = now() WHERE id = $1', [id]);
}

export interface InvitationTarget {
  user_id: number;
  email: string;
  organization_name: string;
  inviter_name: string | null;
}

/** A still-pending invitation of the organization (accepted/removed ones are skipped). */
export async function loadInvitation(
  db: Queryable,
  organizationId: number,
  membershipId: number,
): Promise<InvitationTarget | null> {
  const result = await db.query(
    `SELECT m.user_id, u.email, o.name AS organization_name, inv.full_name AS inviter_name
     FROM organization_memberships m
     JOIN users u ON u.id = m.user_id
     JOIN organizations o ON o.id = m.organization_id
     LEFT JOIN users inv ON inv.id = m.invited_by
     WHERE m.id = $1 AND m.organization_id = $2 AND m.status = 'invited'`,
    [membershipId, organizationId],
  );
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------- usage

export async function addUsage(
  db: Queryable,
  organizationId: number,
  metric: 'messages.sent' | 'storage.bytes',
  delta: number,
  period: string,
) {
  await db.query(
    `INSERT INTO usage_counters (organization_id, metric, period, value, updated_at)
     VALUES ($1, $2, $3, GREATEST($4::bigint, 0), now())
     ON CONFLICT (organization_id, metric, period)
     DO UPDATE SET value = GREATEST(usage_counters.value + $4::bigint, 0), updated_at = now()`,
    [organizationId, metric, period, delta],
  );
}
