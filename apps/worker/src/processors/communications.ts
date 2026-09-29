import { createHash, randomBytes } from 'node:crypto';
import { withTransaction } from '@crm/database';
import {
  buildResetUrl,
  isProviderError,
  memberInvitationEmail,
  passwordResetEmail,
  safeMessage,
} from '@crm/integrations';
import * as comms from '../db/communications.js';
import type { JobContext, WorkerDeps } from '../jobs/context.js';
import type { JobPayload } from '../jobs/definitions.js';
import { PermanentJobError } from '../queue/types.js';

/** Classifies a provider failure: permanent (or out of attempts) → terminal; else retry. */
function outcome(error: unknown, ctx: JobContext) {
  const permanent = isProviderError(error) ? error.permanent : false;
  const code = isProviderError(error) ? error.code : 'PROVIDER_ERROR';
  return { terminal: permanent || ctx.finalAttempt, permanent, code, message: safeMessage(error) };
}

const month = () => new Date().toISOString().slice(0, 7);

/**
 * Lead message delivery. The row lock + status machine make the job
 * idempotent: only a 'Queued' message is sent. A message in 'Sending' is
 * either being sent by a concurrent attempt (inside the send lease: skipped)
 * or was left by an attempt that died mid-call; because the provider may have
 * accepted it we fail it as DELIVERY_UNKNOWN rather than risk a duplicate.
 */
export async function sendMessage(
  deps: WorkerDeps,
  job: JobPayload<'message.send'>,
  ctx: JobContext,
) {
  const { organizationId, messageId } = job;
  const claim = await withTransaction(deps.db, async (tx) => {
    const message = await comms.lockMessage(tx, organizationId, messageId);
    if (!message) return { skip: 'not_found' as const };
    if (message.status === 'Sending' && message.sending_in_progress) {
      // A concurrent attempt (another replica, or a redelivered job) is sending right now.
      return { skip: 'in_progress' as const };
    }
    if (message.status === 'Sending') {
      await comms.markFailed(tx, organizationId, messageId, {
        code: 'DELIVERY_UNKNOWN',
        message: 'A previous send attempt was interrupted; not resent to avoid a duplicate',
      });
      return { skip: 'interrupted' as const };
    }
    if (message.status !== 'Queued') return { skip: 'already_settled' as const };
    if (message.message_type !== 'SMS') {
      await comms.markFailed(tx, organizationId, messageId, {
        code: 'CHANNEL_NOT_SUPPORTED',
        message: `No provider is configured for ${message.message_type} messages`,
      });
      return { skip: 'channel_not_supported' as const };
    }
    if (!message.phone) {
      await comms.markFailed(tx, organizationId, messageId, {
        code: 'INVALID_RECIPIENT',
        message: 'The lead has no phone number',
      });
      return { skip: 'no_recipient' as const };
    }
    await comms.markSending(tx, organizationId, messageId, deps.sms.name);
    return { message, skip: undefined };
  });
  if (!claim.message) {
    deps.logger.info('message_send_skipped', { organizationId, messageId, reason: claim.skip });
    return;
  }
  const message = claim.message;

  try {
    const { providerMessageId } = await deps.sms.send({
      to: message.phone!,
      text: message.content,
      statusCallbackUrl: deps.config.smsStatusCallbackUrl,
    });
    await withTransaction(deps.db, async (tx) => {
      if (await comms.markSent(tx, organizationId, messageId, providerMessageId)) {
        await comms.addUsage(tx, organizationId, 'messages.sent', 1, month());
      }
    });
  } catch (error) {
    const result = outcome(error, ctx);
    if (result.terminal) {
      await comms.markFailed(deps.db, organizationId, messageId, result);
      if (result.permanent) throw new PermanentJobError(result.message, result.code);
      throw error;
    }
    await comms.requeue(deps.db, organizationId, messageId, result.code);
    throw error;
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Password reset email. The token is generated here, right before sending,
 * and only its hash is stored: the raw token exists only in this process's
 * memory and the email itself. A retry issues a fresh token (the previous,
 * undelivered one is replaced). One delivery per reset request.
 */
export async function sendPasswordReset(
  deps: WorkerDeps,
  job: JobPayload<'email.password_reset'>,
  ctx: JobContext,
) {
  const prepared = await withTransaction(deps.db, async (tx) => {
    const reset = await comms.lockPasswordReset(tx, job.passwordResetId);
    if (!reset) return null; // used, expired or the account was disabled
    const delivery = await comms.lockEmailDelivery(tx, {
      organizationId: null,
      kind: 'password_reset',
      dedupeKey: `password_reset.${reset.id}`,
      recipientUserId: reset.user_id,
    });
    if (delivery.status === 'sent' || delivery.status === 'failed') return null;
    const token = randomBytes(32).toString('hex');
    await comms.setResetTokenHash(tx, reset.id, hashToken(token));
    await comms.setEmailDelivery(tx, delivery.id, { status: 'sending' });
    return { reset, delivery, token };
  });
  if (!prepared) return;

  try {
    const sent = await deps.email.send(
      passwordResetEmail(
        prepared.reset.email,
        buildResetUrl(deps.config.frontendUrl, prepared.token),
      ),
    );
    await withTransaction(deps.db, async (tx) => {
      await comms.setEmailDelivery(tx, prepared.delivery.id, {
        status: 'sent',
        providerMessageId: sent.messageId,
      });
      await comms.markResetEmailed(tx, prepared.reset.id);
    });
  } catch (error) {
    const result = outcome(error, ctx);
    await withTransaction(deps.db, async (tx) => {
      // The undelivered token must never become usable.
      await comms.setResetTokenHash(tx, prepared.reset.id, null);
      await comms.setEmailDelivery(tx, prepared.delivery.id, {
        status: result.terminal ? 'failed' : 'pending',
        failureCode: result.code,
      });
    });
    if (result.permanent) throw new PermanentJobError(result.message, result.code);
    throw error;
  }
}

/** Invitation email to an existing identity (sent once per invitation). */
export async function sendMemberInvitation(
  deps: WorkerDeps,
  job: JobPayload<'email.member_invitation'>,
  ctx: JobContext,
) {
  const prepared = await withTransaction(deps.db, async (tx) => {
    const invitation = await comms.loadInvitation(tx, job.organizationId, job.membershipId);
    if (!invitation) return null; // accepted, removed or not in this organization
    const delivery = await comms.lockEmailDelivery(tx, {
      organizationId: job.organizationId,
      kind: 'member_invitation',
      dedupeKey: `member_invitation.${job.organizationId}.${job.membershipId}`,
      recipientUserId: invitation.user_id,
    });
    if (delivery.status === 'sent' || delivery.status === 'failed') return null;
    await comms.setEmailDelivery(tx, delivery.id, { status: 'sending' });
    return { invitation, delivery };
  });
  if (!prepared) return;
  try {
    const sent = await deps.email.send(
      memberInvitationEmail(prepared.invitation.email, {
        organizationName: prepared.invitation.organization_name,
        inviterName: prepared.invitation.inviter_name,
        signInUrl: `${deps.config.frontendUrl.replace(/\/+$/, '')}/login`,
      }),
    );
    await comms.setEmailDelivery(deps.db, prepared.delivery.id, {
      status: 'sent',
      providerMessageId: sent.messageId,
    });
  } catch (error) {
    const result = outcome(error, ctx);
    await comms.setEmailDelivery(deps.db, prepared.delivery.id, {
      status: result.terminal ? 'failed' : 'pending',
      failureCode: result.code,
    });
    if (result.permanent) throw new PermanentJobError(result.message, result.code);
    throw error;
  }
}
