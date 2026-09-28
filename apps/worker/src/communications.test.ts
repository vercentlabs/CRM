import { createHash } from 'node:crypto';
import { createTestSchema, hasTestDatabase, type TestSchema } from '@crm/database';
import { createMemoryEmailSender, ProviderError } from '@crm/integrations';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeSms, seed, testDeps, type Seed } from './__tests__/fixtures.js';
import type { JobContext } from './jobs/context.js';
import type { Logger } from './logger.js';
import * as communications from './processors/communications.js';
import { PermanentJobError } from './queue/types.js';

const ctx = (attempt = 1, maxAttempts = 5): JobContext => ({
  id: 'job',
  attempt,
  maxAttempts,
  finalAttempt: attempt >= maxAttempts,
});

describe.skipIf(!hasTestDatabase)('communication jobs (PostgreSQL)', () => {
  let db: TestSchema;
  let fx: Seed;

  beforeAll(async () => {
    db = await createTestSchema('wk_comms');
    fx = await seed(db.pool);
  });
  afterAll(async () => db?.drop());

  const queued = async (
    type: 'SMS' | 'WhatsApp' = 'SMS',
    organizationId = fx.orgA,
    leadId = fx.leadA,
  ) =>
    (
      await db.pool.query(
        `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content, status, queued_at)
         VALUES ($1, $2, $3, $4, 'Your gold rate update', 'Queued', now()) RETURNING id`,
        [organizationId, leadId, fx.users.aSales, type],
      )
    ).rows[0].id as number;
  const message = async (id: number) =>
    (await db.pool.query('SELECT * FROM messages WHERE id = $1', [id])).rows[0];

  describe('lead messages', () => {
    it('starts queued and becomes Sent only after the provider accepts it', async () => {
      const sms = fakeSms(['ok']);
      const { deps } = testDeps(db.pool, { sms });
      const id = await queued();
      expect((await message(id)).status).toBe('Queued');
      await communications.sendMessage(deps, { organizationId: fx.orgA, messageId: id }, ctx());
      const row = await message(id);
      expect(row).toMatchObject({ status: 'Sent', provider: 'fake', attempts: 1 });
      expect(row.provider_message_id).toMatch(/^fake-1-/);
      expect(row.sent_at).not.toBeNull();
      expect(sms.calls[0]).toMatchObject({
        to: '9876543210',
        statusCallbackUrl: 'https://api.example.test/api/plivo/webhook/message-status',
      });
      const usage = await db.pool.query(
        `SELECT value FROM usage_counters WHERE organization_id = $1 AND metric = 'messages.sent'`,
        [fx.orgA],
      );
      expect(Number(usage.rows[0].value)).toBeGreaterThanOrEqual(1);
    });

    it('does not send again when the same job is replayed', async () => {
      const sms = fakeSms();
      const { deps } = testDeps(db.pool, { sms });
      const id = await queued();
      const job = { organizationId: fx.orgA, messageId: id };
      await communications.sendMessage(deps, job, ctx());
      await communications.sendMessage(deps, job, ctx(2));
      await communications.sendMessage(deps, job, ctx(3));
      expect(sms.calls).toHaveLength(1);
    });

    it('requeues on a transient failure and succeeds on retry', async () => {
      const sms = fakeSms(['transient', 'ok']);
      const { deps } = testDeps(db.pool, { sms });
      const id = await queued();
      const job = { organizationId: fx.orgA, messageId: id };
      await expect(communications.sendMessage(deps, job, ctx(1))).rejects.toThrow(/provider down/);
      expect(await message(id)).toMatchObject({
        status: 'Queued',
        failure_code: 'PROVIDER_UNAVAILABLE',
      });
      await communications.sendMessage(deps, job, ctx(2));
      expect(await message(id)).toMatchObject({ status: 'Sent', attempts: 2 });
    });

    it('fails permanently without retrying on a provider rejection', async () => {
      const sms = fakeSms(['permanent']);
      const { deps } = testDeps(db.pool, { sms });
      const id = await queued();
      await expect(
        communications.sendMessage(deps, { organizationId: fx.orgA, messageId: id }, ctx(1)),
      ).rejects.toBeInstanceOf(PermanentJobError);
      expect(await message(id)).toMatchObject({
        status: 'Failed',
        failure_code: 'PROVIDER_REJECTED',
      });
    });

    it('marks the message Failed on the final transient attempt', async () => {
      const { deps } = testDeps(db.pool, { sms: fakeSms(['transient']) });
      const id = await queued();
      await expect(
        communications.sendMessage(deps, { organizationId: fx.orgA, messageId: id }, ctx(5, 5)),
      ).rejects.toThrow();
      expect((await message(id)).status).toBe('Failed');
    });

    it('fails WhatsApp truthfully (no provider integration) without calling any provider', async () => {
      const sms = fakeSms();
      const { deps } = testDeps(db.pool, { sms });
      const id = await queued('WhatsApp');
      await communications.sendMessage(deps, { organizationId: fx.orgA, messageId: id }, ctx());
      expect(await message(id)).toMatchObject({
        status: 'Failed',
        failure_code: 'CHANNEL_NOT_SUPPORTED',
      });
      expect(sms.calls).toHaveLength(0);
    });

    it('never resends a message whose previous attempt was interrupted mid-send', async () => {
      const sms = fakeSms();
      const { deps } = testDeps(db.pool, { sms });
      const id = await queued();
      await db.pool.query(`UPDATE messages SET status = 'Sending' WHERE id = $1`, [id]);
      await communications.sendMessage(deps, { organizationId: fx.orgA, messageId: id }, ctx(2));
      expect(await message(id)).toMatchObject({
        status: 'Failed',
        failure_code: 'DELIVERY_UNKNOWN',
      });
      expect(sms.calls).toHaveLength(0);
    });

    it('cannot touch another organization’s message', async () => {
      const sms = fakeSms();
      const { deps } = testDeps(db.pool, { sms });
      const idB = await queued('SMS', fx.orgB, fx.leadB);
      await communications.sendMessage(deps, { organizationId: fx.orgA, messageId: idB }, ctx());
      expect((await message(idB)).status).toBe('Queued');
      expect(sms.calls).toHaveLength(0);
    });

    it('never logs message bodies or phone numbers', async () => {
      const lines: string[] = [];
      const logger: Logger = {
        info: (m, f) => lines.push(JSON.stringify([m, f])),
        warn: (m, f) => lines.push(JSON.stringify([m, f])),
        error: (m, f) => lines.push(JSON.stringify([m, f])),
      };
      const { deps } = testDeps(db.pool, { sms: fakeSms(['permanent', 'permanent']), logger });
      const id = await queued();
      await communications
        .sendMessage(deps, { organizationId: fx.orgA, messageId: id }, ctx())
        .catch(() => undefined);
      const { createJobRunner } = await import('./jobs/runner.js');
      await createJobRunner(deps)({
        id: 'j',
        name: 'message.send',
        data: { organizationId: fx.orgA, messageId: await queued() },
        attempt: 1,
        maxAttempts: 1,
      }).catch(() => undefined);
      const text = lines.join('\n');
      expect(text).not.toContain('gold rate update');
      expect(text).not.toContain('9876543210');
      expect(text).toContain('job_failed');
    });
  });

  describe('password reset email', () => {
    const request = async () =>
      (
        await db.pool.query(
          `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, NULL, now() + interval '1 hour') RETURNING id`,
          [fx.users.aSales],
        )
      ).rows[0].id as number;

    it('creates the token at send time, stores only its hash, and sends once', async () => {
      const email = createMemoryEmailSender();
      const { deps } = testDeps(db.pool, { email });
      const id = await request();
      await communications.sendPasswordReset(deps, { passwordResetId: id }, ctx());
      await communications.sendPasswordReset(deps, { passwordResetId: id }, ctx(2));
      expect(email.sent).toHaveLength(1);
      const token = /token=([0-9a-f]{64})/.exec(email.sent[0]!.text)![1]!;
      const row = (
        await db.pool.query('SELECT token_hash, email_sent_at FROM password_resets WHERE id = $1', [
          id,
        ])
      ).rows[0];
      expect(row.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
      expect(row.token_hash).not.toBe(token);
      expect(row.email_sent_at).not.toBeNull();
      const outbox = await db.pool.query(`SELECT payload::text FROM outbox_events`);
      expect(outbox.rows.map((r) => r.payload).join()).not.toContain(token);
    });

    it('invalidates the token when delivery fails and never emails used or expired requests', async () => {
      const failing = {
        send: vi.fn(async () => {
          throw new ProviderError('EMAIL_UNAVAILABLE', 'smtp down', false);
        }),
        verify: async () => true,
      };
      const { deps } = testDeps(db.pool, { email: failing });
      const id = await request();
      await expect(
        communications.sendPasswordReset(deps, { passwordResetId: id }, ctx()),
      ).rejects.toThrow(/smtp down/);
      const row = (
        await db.pool.query('SELECT token_hash FROM password_resets WHERE id = $1', [id])
      ).rows[0];
      expect(row.token_hash).toBeNull();
      const delivery = (
        await db.pool.query(`SELECT status FROM email_deliveries WHERE dedupe_key = $1`, [
          `password_reset.${id}`,
        ])
      ).rows[0];
      expect(delivery.status).toBe('pending');

      const email = createMemoryEmailSender();
      const used = await request();
      await db.pool.query('UPDATE password_resets SET used = true WHERE id = $1', [used]);
      await communications.sendPasswordReset(
        testDeps(db.pool, { email }).deps,
        { passwordResetId: used },
        ctx(),
      );
      expect(email.sent).toHaveLength(0);
    });
  });

  describe('member invitation email', () => {
    it('emails a pending invitation once and only within its organization', async () => {
      const email = createMemoryEmailSender();
      const { deps } = testDeps(db.pool, { email });
      await communications.sendMemberInvitation(
        deps,
        { organizationId: fx.orgA, membershipId: fx.invite },
        ctx(),
      );
      expect(email.sent).toHaveLength(0); // the invitation belongs to organization B
      await communications.sendMemberInvitation(
        deps,
        { organizationId: fx.orgB, membershipId: fx.invite },
        ctx(),
      );
      await communications.sendMemberInvitation(
        deps,
        { organizationId: fx.orgB, membershipId: fx.invite },
        ctx(2),
      );
      expect(email.sent).toHaveLength(1);
      expect(email.sent[0]).toMatchObject({
        to: 'a_sales@example.test',
        subject: 'You have been invited to Beta',
      });
    });
  });
});
