import type { DatabasePool } from '@crm/database';
import {
  createMemoryEmailSender,
  createMemoryStorage,
  type SmsProvider,
  type SmsRequest,
} from '@crm/integrations';
import type { WorkerDeps } from '../jobs/context.js';
import { silentLogger } from '../logger.js';
import { createInlineDriver } from '../queue/inline.js';

/**
 * Two organizations (A, B) with an admin and a sales member each, one lead,
 * task and opportunity per organization. Returns the ids the tests need.
 */
export async function seed(db: DatabasePool) {
  const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];
  const org = async (name: string, slug: string) =>
    (await one('INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id', [name, slug]))
      .id as number;
  const user = async (key: string) =>
    (
      await one(
        `INSERT INTO users (username, email, password_hash, full_name, is_active)
         VALUES ($1, $2, 'x', $3, true) RETURNING id`,
        [key, `${key}@example.test`, `User ${key}`],
      )
    ).id as number;
  const member = (organizationId: number, userId: number, roleId: number, status = 'active') =>
    db.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role_id, status, joined_at)
       VALUES ($1, $2, $3, $4, now()) RETURNING id`,
      [organizationId, userId, roleId, status],
    );

  const orgA = await org('Alpha', 'alpha');
  const orgB = await org('Beta', 'beta');
  const users = {
    aAdmin: await user('a_admin'),
    aSales: await user('a_sales'),
    aOther: await user('a_other'),
    bAdmin: await user('b_admin'),
    outsider: await user('outsider'),
  };
  await member(orgA, users.aAdmin, 1);
  await member(orgA, users.aSales, 3);
  await member(orgA, users.aOther, 3);
  await member(orgB, users.bAdmin, 1);
  const invite = (await member(orgB, users.aSales, 3, 'invited')).rows[0].id as number;

  const lead = async (
    organizationId: number,
    name: string,
    assignedTo: number | null,
    phone = '9876543210',
  ) =>
    (
      await one(
        `INSERT INTO leads (organization_id, full_name, mobile_number, assigned_to, created_by)
         VALUES ($1, $2, $3, $4, $4) RETURNING id`,
        [organizationId, name, phone, assignedTo],
      )
    ).id as number;
  const leadA = await lead(orgA, 'Alpha Lead', users.aSales);
  const leadB = await lead(orgB, 'Beta Lead', users.bAdmin);
  const taskA = (
    await one(
      `INSERT INTO tasks (organization_id, title, due_date, assigned_to, created_by)
       VALUES ($1, 'Call back', now() + interval '30 minutes', $2, $3) RETURNING id`,
      [orgA, users.aSales, users.aAdmin],
    )
  ).id as number;
  const oppA = (
    await one(
      `INSERT INTO opportunities (organization_id, lead_id, title, created_by, assigned_to)
       VALUES ($1, $2, 'Gold plan', $3, $3) RETURNING id`,
      [orgA, leadA, users.aSales],
    )
  ).id as number;
  return { orgA, orgB, users, leadA, leadB, taskA, oppA, invite };
}

export type Seed = Awaited<ReturnType<typeof seed>>;

/** SMS provider fake: records calls; behaviour scripted per test. */
export function fakeSms(script: Array<'ok' | 'transient' | 'permanent'> = []) {
  const calls: SmsRequest[] = [];
  const provider: SmsProvider & { calls: SmsRequest[] } = {
    name: 'fake',
    calls,
    async send(request) {
      calls.push(request);
      const step = script.shift() ?? 'ok';
      if (step === 'transient') {
        const { ProviderError } = await import('@crm/integrations');
        throw new ProviderError('PROVIDER_UNAVAILABLE', 'provider down', false);
      }
      if (step === 'permanent') {
        const { ProviderError } = await import('@crm/integrations');
        throw new ProviderError('PROVIDER_REJECTED', 'invalid destination', true);
      }
      return {
        providerMessageId: `fake-${calls.length}-${Math.random().toString(36).slice(2, 10)}`,
      };
    },
  };
  return provider;
}

export function testDeps(db: DatabasePool, overrides: Partial<WorkerDeps> = {}) {
  const queue = createInlineDriver();
  const email = createMemoryEmailSender();
  const storage = createMemoryStorage();
  const deps: WorkerDeps = {
    db,
    queue,
    email,
    sms: fakeSms(),
    storage,
    logger: silentLogger,
    config: {
      frontendUrl: 'https://crm.example.test',
      smsStatusCallbackUrl: 'https://api.example.test/api/plivo/webhook/message-status',
      allowPrivateWebhookTargets: false,
      webhookTimeoutMs: 1_000,
      outboxRetentionDays: 14,
      fetch: globalThis.fetch,
    },
    ...overrides,
  };
  return { deps, queue, email, storage };
}

export const workerOptions = {
  workerId: 'test-worker',
  outbox: { batchSize: 50, leaseSeconds: 60, maxAttempts: 3, pollMs: 50 },
  schedules: { remindersMs: 3_600_000, maintenanceMs: 3_600_000 },
  healthPort: 0,
  shutdownTimeoutMs: 5_000,
  closeDatabase: false,
};
