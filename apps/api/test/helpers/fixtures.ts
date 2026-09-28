import bcrypt from 'bcrypt';
import type { DatabasePool } from '@crm/database';

export const PASSWORD = 'Passw0rd123';

export interface OrgRef {
  id: number;
  publicId: string;
}

export interface UserRef {
  id: number;
  email: string;
}

export interface TenantFixture {
  orgA: OrgRef;
  orgB: OrgRef;
  users: Record<
    | 'aAdmin'
    | 'aManager'
    | 'aSales'
    | 'aSales2'
    | 'bAdmin'
    | 'bSales'
    | 'multi'
    | 'disabled'
    | 'suspended',
    UserRef
  >;
  records: Record<string, number>;
}

/**
 * Two organizations with members of every built-in role and one record of
 * every tenant-owned type each. `multi` belongs to A (sales) and B (manager);
 * `disabled` is a globally disabled identity; `suspended` has a suspended
 * membership in A.
 */
export async function seedTenants(pool: DatabasePool): Promise<TenantFixture> {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const one = async (sql: string, params: unknown[] = []) =>
    (await pool.query(sql, params)).rows[0];

  const org = async (name: string, slug: string): Promise<OrgRef> => {
    const row = await one(
      'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id, public_id',
      [name, slug],
    );
    return { id: row.id, publicId: row.public_id };
  };
  const orgA = await org('Alpha Corp', 'alpha');
  const orgB = await org('Beta Ltd', 'beta');

  const user = async (key: string, active = true): Promise<UserRef> => {
    const email = `${key}@example.test`;
    const row = await one(
      `INSERT INTO users (username, email, password_hash, full_name, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [key, email, hash, `User ${key}`, active],
    );
    return { id: row.id, email };
  };
  const member = async (orgRef: OrgRef, userRef: UserRef, roleKey: string, status = 'active') => {
    await pool.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role_id, status, joined_at)
       SELECT $1, $2, r.id, $4, now() FROM roles r WHERE r.key = $3 AND r.organization_id IS NULL`,
      [orgRef.id, userRef.id, roleKey, status],
    );
  };

  const users = {
    aAdmin: await user('a_admin'),
    aManager: await user('a_manager'),
    aSales: await user('a_sales'),
    aSales2: await user('a_sales2'),
    bAdmin: await user('b_admin'),
    bSales: await user('b_sales'),
    multi: await user('multi'),
    disabled: await user('disabled', false),
    suspended: await user('suspended'),
  };
  await member(orgA, users.aAdmin, 'admin');
  await member(orgA, users.aManager, 'manager');
  await member(orgA, users.aSales, 'sales');
  await member(orgA, users.aSales2, 'sales');
  await member(orgB, users.bAdmin, 'admin');
  await member(orgB, users.bSales, 'sales');
  await member(orgA, users.multi, 'sales');
  await member(orgB, users.multi, 'manager');
  await member(orgA, users.disabled, 'sales');
  await member(orgA, users.suspended, 'sales', 'suspended');

  const records: Record<string, number> = {};
  const record = async (key: string, sql: string, params: unknown[]) => {
    records[key] = (await one(sql, params)).id;
  };

  const lead = (
    key: string,
    orgRef: OrgRef,
    name: string,
    assignedTo: number | null,
    createdBy: number,
  ) =>
    record(
      key,
      `INSERT INTO leads (organization_id, full_name, mobile_number, email, status, assigned_to, created_by)
       VALUES ($1, $2, '9876543210', $3, 'New', $4, $5) RETURNING id`,
      [orgRef.id, name, `${key}@lead.test`, assignedTo, createdBy],
    );
  await lead('leadA1', orgA, 'Alpha Lead One', users.aSales.id, users.aManager.id);
  await lead('leadA2', orgA, 'Alpha Lead Two', users.aManager.id, users.aManager.id);
  await lead('leadA3', orgA, 'Alpha Lead Three', users.aSales2.id, users.aManager.id);
  await lead('leadB1', orgB, 'Beta Lead One', users.bSales.id, users.bAdmin.id);

  const customer = (key: string, orgRef: OrgRef, assignedTo: number, createdBy: number) =>
    record(
      key,
      `INSERT INTO customers (organization_id, name, email, assigned_to, created_by)
       VALUES ($1, $2, 'shared@customer.test', $3, $4) RETURNING id`,
      [orgRef.id, `${key} customer`, assignedTo, createdBy],
    );
  // Same email in both organizations: allowed since uniqueness is per organization.
  await customer('customerA', orgA, users.aSales.id, users.aAdmin.id);
  await customer('customerB', orgB, users.bSales.id, users.bAdmin.id);

  const opportunity = (
    key: string,
    orgRef: OrgRef,
    leadKey: string,
    assignedTo: number,
    createdBy: number,
  ) =>
    record(
      key,
      `INSERT INTO opportunities (organization_id, lead_id, title, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orgRef.id, records[leadKey], `${key} deal`, assignedTo, createdBy],
    );
  await opportunity('oppA', orgA, 'leadA1', users.aSales.id, users.aSales.id);
  await opportunity('oppB', orgB, 'leadB1', users.bSales.id, users.bSales.id);

  const task = (key: string, orgRef: OrgRef, assignedTo: number, createdBy: number) =>
    record(
      key,
      `INSERT INTO tasks (organization_id, title, due_date, assigned_to, created_by)
       VALUES ($1, $2, now() + interval '2 days', $3, $4) RETURNING id`,
      [orgRef.id, `${key} task`, assignedTo, createdBy],
    );
  await task('taskA', orgA, users.aSales.id, users.aManager.id);
  await task('taskA2', orgA, users.aManager.id, users.aManager.id);
  await task('taskB', orgB, users.bSales.id, users.bAdmin.id);

  const followup = (key: string, orgRef: OrgRef, leadKey: string, assignedTo: number) =>
    record(
      key,
      `INSERT INTO followups (organization_id, lead_id, assigned_to, followup_date, followup_type)
       VALUES ($1, $2, $3, now() + interval '1 day', 'Call') RETURNING id`,
      [orgRef.id, records[leadKey], assignedTo],
    );
  await followup('followupA', orgA, 'leadA1', users.aSales.id);
  await followup('followupB', orgB, 'leadB1', users.bSales.id);

  const note = (key: string, orgRef: OrgRef, createdBy: number) =>
    record(
      key,
      `INSERT INTO notes (organization_id, title, content, tags, created_by)
       VALUES ($1, $2, 'content', ARRAY['x'], $3) RETURNING id`,
      [orgRef.id, `${key} note`, createdBy],
    );
  await note('noteA', orgA, users.aSales.id);
  await note('noteA2', orgA, users.aManager.id);
  await note('noteB', orgB, users.bSales.id);

  const call = (key: string, orgRef: OrgRef, leadKey: string, userId: number) =>
    record(
      key,
      `INSERT INTO calls (organization_id, lead_id, user_id, call_status, start_time)
       VALUES ($1, $2, $3, 'Completed', now()) RETURNING id`,
      [orgRef.id, records[leadKey], userId],
    );
  await call('callA', orgA, 'leadA1', users.aSales.id);
  await call('callB', orgB, 'leadB1', users.bSales.id);

  const message = (key: string, orgRef: OrgRef, leadKey: string, userId: number) =>
    record(
      key,
      `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content)
       VALUES ($1, $2, $3, 'SMS', 'hello') RETURNING id`,
      [orgRef.id, records[leadKey], userId],
    );
  await message('messageA', orgA, 'leadA1', users.aSales.id);
  await message('messageB', orgB, 'leadB1', users.bSales.id);

  const location = (key: string, orgRef: OrgRef) =>
    record(
      key,
      `INSERT INTO sales_locations (organization_id, name) VALUES ($1, $2) RETURNING id`,
      [orgRef.id, `${key} office`],
    );
  await location('locationA', orgA);
  await location('locationB', orgB);

  const conversation = async (key: string, orgRef: OrgRef, participants: number[]) => {
    await record(
      key,
      `INSERT INTO chat_conversations (organization_id, name, is_group, created_by)
       VALUES ($1, $2, true, $3) RETURNING id`,
      [orgRef.id, `${key} room`, participants[0]],
    );
    for (const userId of participants) {
      await pool.query('INSERT INTO chat_participants (conversation_id, user_id) VALUES ($1, $2)', [
        records[key],
        userId,
      ]);
    }
    await pool.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES ($1, $2, 'secret')`,
      [records[key], participants[0]],
    );
  };
  await conversation('convA', orgA, [users.aSales.id, users.aManager.id]);
  await conversation('convB', orgB, [users.bSales.id, users.bAdmin.id]);

  for (const [orgRef, name] of [
    [orgA, 'Alpha Settings'],
    [orgB, 'Beta Settings'],
  ] as const) {
    await pool.query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'site_name', $2)`,
      [orgRef.id, name],
    );
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, action, table_name) VALUES ($1, NULL, 'SEED', $2)`,
      [orgRef.id, name],
    );
  }

  return { orgA, orgB, users, records };
}
