import { randomBytes } from 'node:crypto';
import { createTestSchema, hasTestDatabase, type TestSchema } from '@crm/database';
import { appendEvent } from '@crm/events';
import { encryptSecret, parseSecretKey, verifySignature } from '@crm/integrations';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seed, testDeps, type Seed } from './__tests__/fixtures.js';
import type { JobContext } from './jobs/context.js';
import { silentLogger, type Logger } from './logger.js';
import * as maintenance from './processors/maintenance.js';
import * as webhooks from './processors/webhooks.js';
import { PermanentJobError } from './queue/types.js';

const ctx = (attempt = 1, maxAttempts = 8): JobContext => ({
  id: 'j',
  attempt,
  maxAttempts,
  finalAttempt: attempt >= maxAttempts,
});

describe.skipIf(!hasTestDatabase)('outbound webhooks (PostgreSQL, no network)', () => {
  let db: TestSchema;
  let fx: Seed;
  const key = parseSecretKey(randomBytes(32).toString('base64'));
  const SECRET = 'whsec_test_secret_value';

  beforeAll(async () => {
    db = await createTestSchema('wk_hooks');
    fx = await seed(db.pool);
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query('DELETE FROM webhook_deliveries; DELETE FROM webhook_endpoints');
  });

  const endpoint = async (
    organizationId: number,
    url: string,
    events = ['lead.created'],
    active = true,
  ) =>
    (
      await db.pool.query(
        `INSERT INTO webhook_endpoints (organization_id, url, event_types, secret_ciphertext, active)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [organizationId, url, events, encryptSecret(key, SECRET), active],
      )
    ).rows[0].id as number;
  const event = async (organizationId = fx.orgA) =>
    (await appendEvent(db.pool, {
      type: 'lead.created',
      organizationId,
      aggregateId: fx.leadA,
      payload: { leadId: fx.leadA, assignedTo: null },
    }))!;
  const fakeFetch = (statuses: number[]) =>
    vi.fn(
      async (_url: URL | string, _init?: RequestInit) =>
        new Response(null, { status: statuses.shift() ?? 200 }),
    );
  const setup = (fetchImpl: ReturnType<typeof fakeFetch>, lines: string[] = []) => {
    const logger: Logger = {
      ...silentLogger,
      info: (m, f) => lines.push(JSON.stringify([m, f])),
      warn: (m, f) => lines.push(JSON.stringify([m, f])),
      error: (m, f) => lines.push(JSON.stringify([m, f])),
    };
    const { deps, queue } = testDeps(db.pool, { logger });
    deps.config = {
      ...deps.config,
      fetch: fetchImpl as unknown as typeof fetch,
      webhookSecretKey: key,
      resolver: async () => ['93.184.216.34'],
    };
    return { deps, queue };
  };
  const deliveries = async () =>
    (
      await db.pool.query(
        'SELECT id, organization_id, endpoint_id, status, attempts, response_status FROM webhook_deliveries ORDER BY id',
      )
    ).rows;

  it('fans out once per subscribed endpoint of the same organization and signs each delivery', async () => {
    const fetchImpl = fakeFetch([200]);
    const { deps, queue } = setup(fetchImpl);
    const mine = await endpoint(fx.orgA, 'https://hooks.example.com/crm');
    await endpoint(fx.orgA, 'https://hooks.example.com/other', ['task.completed']);
    await endpoint(fx.orgB, 'https://hooks.example.com/beta');
    const eventId = await event();
    await webhooks.fanOut(deps, { organizationId: fx.orgA, eventId });
    await webhooks.fanOut(deps, { organizationId: fx.orgA, eventId }); // replay: same delivery
    const rows = await deliveries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: fx.orgA,
      endpoint_id: mine,
      status: 'pending',
    });

    const { createJobRunner } = await import('./jobs/runner.js');
    await queue.start(createJobRunner(deps));
    await (queue as unknown as { drain(): Promise<void> }).drain();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://hooks.example.com/crm');
    expect(init!.redirect).toBe('manual');
    const headers = init!.headers as Record<string, string>;
    const body = init!.body as string;
    const timestamp = Number(headers['x-crm-timestamp']);
    expect(verifySignature(SECRET, headers['x-crm-signature']!, timestamp, body)).toBe(true);
    expect(headers['x-crm-event-id']).toBe(eventId);
    expect(headers['x-crm-event-type']).toBe('lead.created');
    const parsed = JSON.parse(body);
    expect(parsed).toMatchObject({ id: eventId, type: 'lead.created', data: { leadId: fx.leadA } });
    expect(typeof parsed.organizationId).toBe('string'); // public id, never the numeric id
    expect((await deliveries())[0]).toMatchObject({
      status: 'delivered',
      response_status: 200,
      attempts: 1,
    });

    // Replaying a delivered delivery never calls the endpoint again.
    await webhooks.deliver(deps, { organizationId: fx.orgA, deliveryId: rows[0].id }, ctx());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx, fails 4xx permanently, and cancels disabled endpoints', async () => {
    const fetchImpl = fakeFetch([503, 200, 400]);
    const { deps } = setup(fetchImpl);
    const hook = await endpoint(fx.orgA, 'https://hooks.example.com/crm');
    await webhooks.fanOut(deps, { organizationId: fx.orgA, eventId: await event() });
    const [first] = await deliveries();
    await expect(
      webhooks.deliver(deps, { organizationId: fx.orgA, deliveryId: first.id }, ctx(1)),
    ).rejects.toThrow(/503/);
    expect((await deliveries())[0]).toMatchObject({ status: 'pending', response_status: 503 });
    await webhooks.deliver(deps, { organizationId: fx.orgA, deliveryId: first.id }, ctx(2));
    expect((await deliveries())[0]).toMatchObject({ status: 'delivered', attempts: 2 });

    await webhooks.fanOut(deps, { organizationId: fx.orgA, eventId: await event() });
    const second = (await deliveries())[1];
    await expect(
      webhooks.deliver(deps, { organizationId: fx.orgA, deliveryId: second.id }, ctx(1)),
    ).rejects.toBeInstanceOf(PermanentJobError);
    expect((await deliveries())[1]).toMatchObject({ status: 'failed', response_status: 400 });

    await webhooks.fanOut(deps, { organizationId: fx.orgA, eventId: await event() });
    await db.pool.query('UPDATE webhook_endpoints SET active = false WHERE id = $1', [hook]);
    const third = (await deliveries())[2];
    await webhooks.deliver(deps, { organizationId: fx.orgA, deliveryId: third.id }, ctx());
    expect((await deliveries())[2].status).toBe('cancelled');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('blocks private-network targets and never logs secrets or payloads', async () => {
    const lines: string[] = [];
    const fetchImpl = fakeFetch([200]);
    const { deps } = setup(fetchImpl, lines);
    deps.config.resolver = async () => ['10.0.0.8'];
    await endpoint(fx.orgA, 'https://internal.example.com/hook');
    await webhooks.fanOut(deps, { organizationId: fx.orgA, eventId: await event() });
    const [row] = await deliveries();
    await expect(
      webhooks.deliver(deps, { organizationId: fx.orgA, deliveryId: row.id }, ctx()),
    ).rejects.toBeInstanceOf(PermanentJobError);
    expect(fetchImpl).not.toHaveBeenCalled();
    const stored = (await db.pool.query('SELECT status, last_error FROM webhook_deliveries'))
      .rows[0];
    expect(stored.status).toBe('failed');
    expect(stored.last_error).toMatch(/TARGET_NOT_ALLOWED/);
    const secretStored = (await db.pool.query('SELECT secret_ciphertext FROM webhook_endpoints'))
      .rows[0];
    expect(secretStored.secret_ciphertext).not.toContain(SECRET);
    expect(lines.join('\n')).not.toContain(SECRET);
  });

  it('cannot deliver another organization’s delivery', async () => {
    const fetchImpl = fakeFetch([200]);
    const { deps } = setup(fetchImpl);
    await endpoint(fx.orgB, 'https://hooks.example.com/beta');
    await webhooks.fanOut(deps, { organizationId: fx.orgB, eventId: await event(fx.orgB) });
    const [row] = await deliveries();
    await webhooks.deliver(deps, { organizationId: fx.orgA, deliveryId: row.id }, ctx());
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await deliveries())[0].status).toBe('pending');
    // Fan-out through the wrong organization finds no event.
    await webhooks.fanOut(deps, { organizationId: fx.orgA, eventId: await event(fx.orgB) });
    expect(await deliveries()).toHaveLength(1);
  });
});

describe.skipIf(!hasTestDatabase)('file lifecycle jobs (PostgreSQL)', () => {
  let db: TestSchema;
  let fx: Seed;

  beforeAll(async () => {
    db = await createTestSchema('wk_files');
    fx = await seed(db.pool);
  });
  afterAll(async () => db?.drop());

  const file = async (status: 'uploaded' | 'deleted', providerFileId: string, expired = false) =>
    (
      await db.pool.query(
        `INSERT INTO files (organization_id, uploaded_by, provider, provider_file_id, storage_key, url, filename,
                            mime_type, size_bytes, purpose, status, expires_at, deleted_at)
         VALUES ($1, $2, 'memory', $3, 'k', 'memory://k', 'a.png', 'image/png', 100, 'chat_attachment', $4::varchar,
                 CASE WHEN $5::boolean THEN now() - interval '1 hour' ELSE now() + interval '1 day' END,
                 CASE WHEN $4::varchar = 'deleted' THEN now() END)
         RETURNING id`,
        [fx.orgA, fx.users.aSales, providerFileId, status, expired],
      )
    ).rows[0].id as number;

  it('expires unattached uploads through the normal deletion path and releases usage', async () => {
    await db.pool.query(
      `INSERT INTO usage_counters (organization_id, metric, period, value) VALUES ($1, 'storage.bytes', 'lifetime', 300)`,
      [fx.orgA],
    );
    const expired = await file('uploaded', 'p1', true);
    const fresh = await file('uploaded', 'p2', false);
    const { deps } = testDeps(db.pool);
    await maintenance.sweep(deps);
    const states = (await db.pool.query('SELECT id, status FROM files ORDER BY id')).rows;
    expect(states).toEqual([
      { id: expired, status: 'deleted' },
      { id: fresh, status: 'uploaded' },
    ]);
    const usage = (
      await db.pool.query(`SELECT value FROM usage_counters WHERE organization_id = $1`, [fx.orgA])
    ).rows[0];
    expect(Number(usage.value)).toBe(200);
    const events = (
      await db.pool.query(`SELECT event_type, organization_id, payload FROM outbox_events`)
    ).rows;
    expect(events).toEqual([
      { event_type: 'file.deleted', organization_id: fx.orgA, payload: { fileId: expired } },
    ]);
  });

  it('removes the provider object idempotently and only within the organization', async () => {
    const { deps, storage } = testDeps(db.pool);
    const stored = await storage.put({
      buffer: Buffer.from('x'),
      folder: 'f',
      name: 'n',
      tags: [],
    });
    const id = await file('deleted', stored.providerFileId);
    await maintenance.deleteFileObject(deps, { organizationId: fx.orgB, fileId: id }, ctx());
    expect(storage.objects.has(stored.providerFileId)).toBe(true);
    await maintenance.deleteFileObject(deps, { organizationId: fx.orgA, fileId: id }, ctx());
    await maintenance.deleteFileObject(deps, { organizationId: fx.orgA, fileId: id }, ctx());
    expect(storage.objects.has(stored.providerFileId)).toBe(false);
    const row = (await db.pool.query('SELECT provider_deleted_at FROM files WHERE id = $1', [id]))
      .rows[0];
    expect(row.provider_deleted_at).not.toBeNull();
  });
});
