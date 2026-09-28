import { withTransaction } from '@crm/database';
import { BUILT_IN_ROLES, type GrantMap } from '@crm/permissions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { seedTenants, type TenantFixture } from './helpers/fixtures.js';

/**
 * Repository and service tests without HTTP: repositories always apply the
 * tenant they are given; services apply permissions, scope and transactions.
 */
describe.skipIf(!hasTestDatabase)('repositories and services', () => {
  let db: TestSchema;
  let fx: TenantFixture;
  type Actor = import('../src/platform/tenancy.js').Actor;
  let actors: Record<string, Actor>;
  let leads: typeof import('../src/modules/leads/leads.repository.js');
  let customers: typeof import('../src/modules/customers/customers.repository.js');
  let notes: typeof import('../src/modules/notes/notes.repository.js');
  let reports: typeof import('../src/modules/reports/reports.repository.js');
  let tenancy: typeof import('../src/platform/tenancy.js');
  let leadService: typeof import('../src/modules/leads/leads.service.js');
  let messageService: typeof import('../src/modules/messages/messages.service.js');
  let chatService: typeof import('../src/modules/chat/chat.service.js');
  let AppError: typeof import('../src/platform/http/errors.js').AppError;
  let pool: import('@crm/database').DatabasePool;

  const tenantA = () => ({ organizationId: fx.orgA.id });
  const tenantB = () => ({ organizationId: fx.orgB.id });
  const page = { limit: 100, offset: 0 };

  beforeAll(async () => {
    db = await createTestSchema('crm_modules');
    fx = await seedTenants(db.pool);
    process.env.DATABASE_URL = db.url;
    leads = await import('../src/modules/leads/leads.repository.js');
    customers = await import('../src/modules/customers/customers.repository.js');
    notes = await import('../src/modules/notes/notes.repository.js');
    reports = await import('../src/modules/reports/reports.repository.js');
    tenancy = await import('../src/platform/tenancy.js');
    leadService = await import('../src/modules/leads/leads.service.js');
    messageService = await import('../src/modules/messages/messages.service.js');
    chatService = await import('../src/modules/chat/chat.service.js');
    AppError = (await import('../src/platform/http/errors.js')).AppError;
    pool = (await import('../src/platform/db.js')).pool;

    const actor = (
      key: keyof TenantFixture['users'],
      org: TenantFixture['orgA'],
      role: 'admin' | 'manager' | 'sales',
    ): Actor => ({
      organizationId: org.id,
      organizationPublicId: org.publicId,
      userId: fx.users[key].id,
      email: fx.users[key].email,
      permissions: new Map(Object.entries(BUILT_IN_ROLES[role].grants)) as GrantMap,
    });
    actors = {
      aAdmin: actor('aAdmin', fx.orgA, 'admin'),
      aManager: actor('aManager', fx.orgA, 'manager'),
      aSales: actor('aSales', fx.orgA, 'sales'),
      bAdmin: actor('bAdmin', fx.orgB, 'admin'),
    };
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  const rejects = async (promise: Promise<unknown>, status: number) => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as InstanceType<typeof AppError>).status).toBe(status);
  };

  describe('repositories', () => {
    it('scopes lead lists to the tenant and owner', async () => {
      const a = await leads.list(db.pool, tenantA(), { ownerId: null }, 'l.id ASC', page);
      expect(a.rows.map((l) => l.id)).toEqual([
        fx.records.leadA1!,
        fx.records.leadA2!,
        fx.records.leadA3!,
      ]);
      const b = await leads.list(db.pool, tenantB(), { ownerId: null }, 'l.id ASC', page);
      expect(b.rows.map((l) => l.id)).toEqual([fx.records.leadB1!]);
      const own = await leads.list(
        db.pool,
        tenantA(),
        { ownerId: fx.users.aSales.id },
        'l.id ASC',
        page,
      );
      expect(own.rows.map((l) => l.id)).toEqual([fx.records.leadA1!]);
      expect(own.total).toBe(1);
    });

    it('never finds another tenant’s record by id', async () => {
      expect(await leads.findById(db.pool, tenantB(), fx.records.leadA1!)).toBeNull();
      expect(await customers.findById(db.pool, tenantB(), fx.records.customerA!)).toBeNull();
      expect(
        await leads.visibleIds(db.pool, tenantA(), [fx.records.leadA1!, fx.records.leadB1!], null),
      ).toEqual([fx.records.leadA1!]);
    });

    it('escapes LIKE wildcards in search', async () => {
      expect(
        (await leads.list(db.pool, tenantA(), { ownerId: null, search: '%' }, 'l.id ASC', page))
          .total,
      ).toBe(0);
      expect(
        (await leads.list(db.pool, tenantA(), { ownerId: null, search: '_' }, 'l.id ASC', page))
          .total,
      ).toBe(0);
      expect(
        (
          await leads.list(
            db.pool,
            tenantA(),
            { ownerId: null, search: 'lead one' },
            'l.id ASC',
            page,
          )
        ).total,
      ).toBe(1);
    });

    it('keeps customer email uniqueness per organization', async () => {
      const data = {
        name: 'Dup',
        email: 'shared@customer.test',
        phone: null,
        address: null,
        assigned_to: null,
        created_by: fx.users.aAdmin.id,
      };
      expect(await customers.insertIfAbsent(db.pool, tenantA(), data)).toBeNull();
      const fresh = await customers.insertIfAbsent(db.pool, tenantA(), {
        ...data,
        email: 'fresh@customer.test',
      });
      expect(fresh).toEqual(expect.any(Number));
      expect(await customers.emailTaken(db.pool, tenantB(), 'fresh@customer.test')).toBe(false);
    });

    it('uses one WHERE builder for note lists and counts', async () => {
      const result = await notes.list(
        db.pool,
        tenantA(),
        { ownerId: fx.users.aSales.id, tags: ['x'] },
        'n.id ASC',
        page,
      );
      expect(result.rows.map((n) => n.id)).toEqual([fx.records.noteA!]);
      expect(result.total).toBe(result.rows.length);
    });

    it('computes reports per tenant', async () => {
      const a = await reports.dashboardSummary(db.pool, tenantA(), null);
      const b = await reports.dashboardSummary(db.pool, tenantB(), null);
      expect(b.totalLeads).toBe(1);
      expect(a.totalLeads).toBeGreaterThanOrEqual(3);
      const own = await reports.dashboardSummary(db.pool, tenantA(), fx.users.aSales.id);
      expect(own.totalLeads).toBe(1);
    });

    it('treats only active members of the organization as members', async () => {
      const ids = [
        fx.users.aSales.id,
        fx.users.bSales.id,
        fx.users.disabled.id,
        fx.users.suspended.id,
        fx.users.multi.id,
      ];
      expect((await tenancy.filterActiveMembers(db.pool, tenantA(), ids)).sort()).toEqual(
        [fx.users.aSales.id, fx.users.multi.id].sort(),
      );
    });

    it('rolls back every statement of a failed transaction', async () => {
      await expect(
        withTransaction(db.pool, async (client) => {
          await client.query(
            `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'tx_probe', '1')`,
            [fx.orgA.id],
          );
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      const rows = await db.pool.query(`SELECT 1 FROM settings WHERE key = 'tx_probe'`);
      expect(rows.rows).toHaveLength(0);
    });
  });

  describe('services', () => {
    it('answers 404 across tenants and 403 outside own scope', async () => {
      await rejects(leadService.getLead(actors.bAdmin!, fx.records.leadA1!), 404);
      await rejects(leadService.getLead(actors.aSales!, fx.records.leadA2!), 403);
      expect((await leadService.getLead(actors.aSales!, fx.records.leadA1!)).id).toBe(
        fx.records.leadA1!,
      );
    });

    it('rejects assignees from other organizations', async () => {
      await rejects(
        leadService.assignLead(actors.aManager!, fx.records.leadA2!, {
          assigned_to: fx.users.bSales.id,
        }),
        400,
      );
      await rejects(
        leadService.assignLead(actors.aManager!, fx.records.leadA2!, {
          assigned_to: fx.users.suspended.id,
        }),
        400,
      );
    });

    it('sends bulk messages all-or-nothing', async () => {
      const before = Number((await db.pool.query('SELECT COUNT(*) FROM messages')).rows[0].count);
      await rejects(
        messageService.sendBulk(actors.aManager!, {
          lead_ids: [fx.records.leadA1!, fx.records.leadB1!],
          channel: 'sms',
          content: 'x',
        }),
        404,
      );
      expect(Number((await db.pool.query('SELECT COUNT(*) FROM messages')).rows[0].count)).toBe(
        before,
      );
      const ok = await messageService.sendBulk(actors.aManager!, {
        lead_ids: [fx.records.leadA1!, fx.records.leadA2!],
        channel: 'whatsapp',
        content: 'x',
      });
      expect(ok.count).toBe(2);
    });

    it('requires chat participation even for administrators', async () => {
      await rejects(chatService.listMessages(actors.aAdmin!, fx.records.convA!), 404);
      expect(
        (await chatService.listMessages(actors.aManager!, fx.records.convA!)).length,
      ).toBeGreaterThan(0);
    });
  });
});
