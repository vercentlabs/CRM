import bcrypt from 'bcrypt';
import { BUILT_IN_ROLES, BUILT_IN_ROLE_KEYS, ALL_PERMISSIONS } from '@crm/permissions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapOrganization } from '../src/platform/organizations/bootstrap.js';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { call, startApp, type TestServer } from './helpers/http.js';

const LEGACY_ORG_PUBLIC_ID = '00000000-0000-4000-8000-000000000001';
const TENANT_TABLES = [
  'leads',
  'followups',
  'calls',
  'messages',
  'notes',
  'tasks',
  'customers',
  'opportunities',
  'sales_locations',
  'user_locations',
  'settings',
  'chat_conversations',
  'audit_logs',
] as const;

describe.skipIf(!hasTestDatabase)('Phase 2 migrations', () => {
  describe('A. empty database', () => {
    let db: TestSchema;
    beforeAll(async () => {
      db = await createTestSchema('crm_mig_empty');
    });
    afterAll(async () => db?.drop());

    it('creates the identity model without inventing an organization', async () => {
      const orgs = await db.pool.query('SELECT count(*) FROM organizations');
      expect(Number(orgs.rows[0].count)).toBe(0);
      expect(Number((await db.pool.query('SELECT count(*) FROM settings')).rows[0].count)).toBe(0);
      const roles = await db.pool.query('SELECT id, key, legacy_role_id FROM roles ORDER BY id');
      expect(roles.rows).toEqual([
        { id: 1, key: 'admin', legacy_role_id: 1 },
        { id: 2, key: 'manager', legacy_role_id: 2 },
        { id: 3, key: 'sales', legacy_role_id: 3 },
      ]);
    });

    it('seeds exactly the permission vocabulary and role grants from @crm/permissions', async () => {
      const permissions = (
        await db.pool.query('SELECT key FROM permissions ORDER BY key')
      ).rows.map((r) => r.key);
      expect(permissions).toEqual([...ALL_PERMISSIONS].sort());
      for (const key of BUILT_IN_ROLE_KEYS) {
        const rows = await db.pool.query(
          `SELECT rp.permission_key, rp.scope FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
           WHERE r.key = $1 AND r.organization_id IS NULL`,
          [key],
        );
        const actual = Object.fromEntries(rows.rows.map((r) => [r.permission_key, r.scope]));
        expect(actual).toEqual(BUILT_IN_ROLES[key].grants);
      }
    });

    it('enforces NOT NULL tenancy and tenant-consistent parent references', async () => {
      const nullable = await db.pool.query(
        `SELECT table_name, is_nullable FROM information_schema.columns
         WHERE table_schema = $1 AND column_name = 'organization_id' ORDER BY table_name`,
        [db.schema],
      );
      const byTable = Object.fromEntries(nullable.rows.map((r) => [r.table_name, r.is_nullable]));
      for (const table of TENANT_TABLES.filter((t) => t !== 'audit_logs'))
        expect(byTable[table]).toBe('NO');
      expect(byTable.audit_logs).toBe('YES');
    });

    it('bootstraps a first organization and admin who can sign in', async () => {
      const result = await bootstrapOrganization(db.pool, {
        organizationName: 'Fresh Install Inc',
        adminEmail: 'owner@fresh.test',
        adminPassword: 'Bootstrap123pass',
      });
      expect(result.slug).toBe('fresh-install-inc');
      await expect(
        bootstrapOrganization(db.pool, {
          organizationName: 'Weak',
          adminEmail: 'weak@fresh.test',
          adminPassword: 'short1',
        }),
      ).rejects.toThrow(/at least 12/);
      const settings = await db.pool.query(
        `SELECT s.value FROM settings s JOIN organizations o ON o.id = s.organization_id
         WHERE o.public_id = $1 AND s.key = 'site_name'`,
        [result.organizationPublicId],
      );
      expect(settings.rows[0].value).toBe('Fresh Install Inc');
    });
  });

  describe('B. existing single-company database', () => {
    let db: TestSchema;
    let server: TestServer;
    const before: Record<string, number> = {};
    const ids: Record<string, number> = {};

    beforeAll(async () => {
      db = await createTestSchema('crm_mig_legacy', { upTo: '0001' });
      const hash = await bcrypt.hash('Legacy123pass', 4);
      const one = async (sql: string, params: unknown[] = []) =>
        (await db.pool.query(sql, params)).rows[0];

      // Representative pre-Phase-2 data (global roles 1/2/3, no organizations).
      for (const [key, role, active] of [
        ['admin', 1, true],
        ['manager', 2, true],
        ['sales', 3, true],
        ['former', 3, false],
      ] as const) {
        ids[key] = (
          await one(
            `INSERT INTO users (username, email, password_hash, full_name, role_id, is_active)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [key, `${key}@legacy.test`, hash, `Legacy ${key}`, role, active],
          )
        ).id;
      }
      await db.pool.query(`UPDATE settings SET value = 'Legacy Co' WHERE key = 'site_name'`);
      ids.location = (
        await one(`INSERT INTO sales_locations (name, manager_id) VALUES ('HQ', $1) RETURNING id`, [
          ids.manager,
        ])
      ).id;
      ids.lead = (
        await one(
          `INSERT INTO leads (full_name, mobile_number, assigned_to, created_by, location_id)
         VALUES ('Legacy Lead', '9876543210', $1, $2, $3) RETURNING id`,
          [ids.sales, ids.manager, ids.location],
        )
      ).id;
      await db.pool.query(
        `INSERT INTO followups (lead_id, assigned_to, followup_date, followup_type) VALUES ($1, $2, now() + interval '1 day', 'Call')`,
        [ids.lead, ids.sales],
      );
      await db.pool.query(
        `INSERT INTO calls (lead_id, user_id, call_status, start_time) VALUES ($1, $2, 'Completed', now())`,
        [ids.lead, ids.sales],
      );
      await db.pool.query(
        `INSERT INTO messages (lead_id, user_id, message_type, content) VALUES ($1, $2, 'SMS', 'hi')`,
        [ids.lead, ids.sales],
      );
      await db.pool.query(`INSERT INTO notes (title, content, created_by) VALUES ('n', 'c', $1)`, [
        ids.sales,
      ]);
      await db.pool.query(
        `INSERT INTO tasks (title, due_date, assigned_to, created_by) VALUES ('t', now(), $1, $2)`,
        [ids.sales, ids.manager],
      );
      await db.pool.query(
        `INSERT INTO customers (name, email, created_by) VALUES ('c', 'c@legacy.test', $1)`,
        [ids.admin],
      );
      await db.pool.query(
        `INSERT INTO opportunities (lead_id, title, created_by) VALUES ($1, 'o', $2)`,
        [ids.lead, ids.sales],
      );
      await db.pool.query(
        `INSERT INTO user_locations (user_id, latitude, longitude) VALUES ($1, 1, 2)`,
        [ids.sales],
      );
      const conv = await one(
        `INSERT INTO chat_conversations (name, created_by) VALUES ('room', $1) RETURNING id`,
        [ids.sales],
      );
      await db.pool.query(
        `INSERT INTO chat_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`,
        [conv.id, ids.sales, ids.manager],
      );
      await db.pool.query(
        `INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES ($1, $2, 'hello')`,
        [conv.id, ids.sales],
      );
      await db.pool.query(
        `INSERT INTO audit_logs (user_id, action, table_name) VALUES ($1, 'LEGACY', 'leads')`,
        [ids.admin],
      );

      for (const table of [...TENANT_TABLES, 'users', 'chat_messages', 'chat_participants']) {
        before[table] = Number(
          (await db.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,
        );
      }

      await db.migrateAll();
    });

    afterAll(async () => {
      await server?.close();
      await db?.drop();
    });

    it('creates exactly one deterministic legacy organization', async () => {
      const orgs = await db.pool.query('SELECT public_id, name, slug FROM organizations');
      expect(orgs.rows).toEqual([
        { public_id: LEGACY_ORG_PUBLIC_ID, name: 'Legacy Co', slug: 'default' },
      ]);
      await db.migrateAll(); // repeat-safe: already applied, nothing re-runs
      expect(
        Number((await db.pool.query('SELECT count(*) FROM organizations')).rows[0].count),
      ).toBe(1);
    });

    it('migrates every user to a membership with the equivalent role', async () => {
      const rows = await db.pool.query(
        `SELECT u.username, r.key, m.status FROM organization_memberships m
         JOIN users u ON u.id = m.user_id JOIN roles r ON r.id = m.role_id ORDER BY u.id`,
      );
      expect(rows.rows).toEqual([
        { username: 'admin', key: 'admin', status: 'active' },
        { username: 'manager', key: 'manager', status: 'active' },
        { username: 'sales', key: 'sales', status: 'active' },
        { username: 'former', key: 'sales', status: 'suspended' },
      ]);
    });

    it('preserves every record and assigns it to the legacy organization', async () => {
      const org = (await db.pool.query('SELECT id FROM organizations')).rows[0].id;
      for (const table of [...TENANT_TABLES, 'users', 'chat_messages', 'chat_participants']) {
        expect(
          Number((await db.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count),
          table,
        ).toBe(before[table]);
      }
      for (const table of TENANT_TABLES) {
        const stray = await db.pool.query(
          `SELECT count(*) FROM ${table} WHERE organization_id IS DISTINCT FROM $1`,
          [org],
        );
        expect(Number(stray.rows[0].count), table).toBe(0);
      }
    });

    it('keeps foreign keys resolvable', async () => {
      const orphanFollowups = await db.pool.query(
        `SELECT count(*) FROM followups f LEFT JOIN leads l ON l.id = f.lead_id AND l.organization_id = f.organization_id WHERE l.id IS NULL`,
      );
      expect(Number(orphanFollowups.rows[0].count)).toBe(0);
      const lead = await db.pool.query(
        `SELECT l.id FROM leads l JOIN sales_locations s ON s.id = l.location_id AND s.organization_id = l.organization_id
         JOIN users u ON u.id = l.assigned_to WHERE l.id = $1`,
        [ids.lead],
      );
      expect(lead.rows).toHaveLength(1);
    });

    it('lets existing users sign in and see their migrated data', async () => {
      process.env.DATABASE_URL = db.url;
      server = await startApp();
      const login = await call(server.baseUrl, 'POST', '/auth/login', {
        body: { email: 'sales@legacy.test', password: 'Legacy123pass' },
      });
      expect(login.status).toBe(200);
      expect(login.body.data.user.roleId).toBe(3);
      const leads = await call(server.baseUrl, 'GET', '/leads', { token: login.body.data.token });
      expect(leads.body.leads.map((l: { id: number }) => l.id)).toEqual([ids.lead]);

      const former = await call(server.baseUrl, 'POST', '/auth/login', {
        body: { email: 'former@legacy.test', password: 'Legacy123pass' },
      });
      expect(former.status).toBe(401);

      const admin = await call(server.baseUrl, 'POST', '/auth/login', {
        body: { email: 'admin@legacy.test', password: 'Legacy123pass' },
      });
      const settings = await call(server.baseUrl, 'GET', '/settings', {
        token: admin.body.data.token,
      });
      expect(settings.body.data.settings.site_name).toBe('Legacy Co');
      expect(Object.keys(settings.body.data.settings)).toHaveLength(before.settings!);
    });
  });
});
