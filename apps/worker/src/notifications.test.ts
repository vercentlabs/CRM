import { createTestSchema, hasTestDatabase, type TestSchema } from '@crm/database';
import { appendEvent } from '@crm/events';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seed, testDeps, type Seed } from './__tests__/fixtures.js';
import * as notifications from './processors/notifications.js';

describe.skipIf(!hasTestDatabase)('notifications and reminders (PostgreSQL)', () => {
  let db: TestSchema;
  let fx: Seed;

  beforeAll(async () => {
    db = await createTestSchema('wk_notify');
    fx = await seed(db.pool);
  });
  afterAll(async () => db?.drop());
  beforeEach(async () => {
    await db.pool.query('DELETE FROM notifications');
  });

  const rows = async () =>
    (
      await db.pool.query(
        'SELECT organization_id, user_id, type, title, body, entity_type, entity_id FROM notifications ORDER BY id',
      )
    ).rows;

  const assigned = async (
    organizationId: number,
    leadId: number,
    assignedTo: number,
    actor: number,
  ) =>
    (await appendEvent(db.pool, {
      type: 'lead.assigned',
      organizationId,
      actorUserId: actor,
      aggregateId: leadId,
      payload: { leadId, assignedTo, previousAssignedTo: null },
    }))!;

  it('notifies only the new assignee, once, in the event’s organization', async () => {
    const { deps } = testDeps(db.pool);
    const eventId = await assigned(fx.orgA, fx.leadA, fx.users.aSales, fx.users.aAdmin);
    await notifications.notifyFromEvent(deps, { organizationId: fx.orgA, eventId });
    await notifications.notifyFromEvent(deps, { organizationId: fx.orgA, eventId }); // replay
    expect(await rows()).toEqual([
      {
        organization_id: fx.orgA,
        user_id: fx.users.aSales,
        type: 'lead.assigned',
        title: 'Lead assigned to you',
        body: 'Alpha Lead',
        entity_type: 'lead',
        entity_id: fx.leadA,
      },
    ]);
  });

  it('does not notify members about their own actions', async () => {
    const { deps } = testDeps(db.pool);
    const eventId = await assigned(fx.orgA, fx.leadA, fx.users.aSales, fx.users.aSales);
    await notifications.notifyFromEvent(deps, { organizationId: fx.orgA, eventId });
    expect(await rows()).toEqual([]);
  });

  it('never reads an event through another organization, nor notifies non-members', async () => {
    const { deps } = testDeps(db.pool);
    const eventId = await assigned(fx.orgA, fx.leadA, fx.users.aSales, fx.users.aAdmin);
    await notifications.notifyFromEvent(deps, { organizationId: fx.orgB, eventId });
    expect(await rows()).toEqual([]);
    // The outsider is not a member of A: no notification even if named as assignee.
    const foreign = await assigned(fx.orgA, fx.leadA, fx.users.outsider, fx.users.aAdmin);
    await notifications.notifyFromEvent(deps, { organizationId: fx.orgA, eventId: foreign });
    expect(await rows()).toEqual([]);
  });

  it('notifies the assignee of a task and the owner of a moved opportunity', async () => {
    const { deps } = testDeps(db.pool);
    const task = (await appendEvent(db.pool, {
      type: 'task.assigned',
      organizationId: fx.orgA,
      actorUserId: fx.users.aAdmin,
      aggregateId: fx.taskA,
      payload: { taskId: fx.taskA, assignedTo: fx.users.aSales, dueDate: new Date().toISOString() },
    }))!;
    const stage = (await appendEvent(db.pool, {
      type: 'opportunity.stage_changed',
      organizationId: fx.orgA,
      actorUserId: fx.users.aAdmin,
      aggregateId: fx.oppA,
      payload: {
        opportunityId: fx.oppA,
        from: 'Prospecting',
        to: 'Proposal',
        assignedTo: fx.users.aSales,
      },
    }))!;
    await notifications.notifyFromEvent(deps, { organizationId: fx.orgA, eventId: task });
    await notifications.notifyFromEvent(deps, { organizationId: fx.orgA, eventId: stage });
    expect((await rows()).map((r) => [r.user_id, r.type, r.title])).toEqual([
      [fx.users.aSales, 'task.assigned', 'Task assigned to you'],
      [fx.users.aSales, 'opportunity.stage_changed', 'Opportunity moved to Proposal'],
    ]);
  });

  it('creates each reminder once per due time and again after rescheduling', async () => {
    const { deps } = testDeps(db.pool);
    await db.pool.query(
      `UPDATE leads SET next_call_at = now() + interval '10 minutes' WHERE id = $1`,
      [fx.leadA],
    );
    await db.pool.query(`UPDATE leads SET next_call_at = now() - interval '1 hour' WHERE id = $1`, [
      fx.leadB,
    ]);
    for (let i = 0; i < 3; i++) await notifications.scanReminders(deps);
    const types = (await rows()).map((r) => `${r.organization_id}:${r.user_id}:${r.type}`).sort();
    expect(types).toEqual(
      [
        `${fx.orgA}:${fx.users.aSales}:followup.due`,
        `${fx.orgA}:${fx.users.aSales}:task.due`,
        `${fx.orgB}:${fx.users.bAdmin}:followup.overdue`,
      ].sort(),
    );
    await db.pool.query(
      `UPDATE leads SET next_call_at = now() + interval '12 minutes' WHERE id = $1`,
      [fx.leadA],
    );
    await notifications.scanReminders(deps);
    expect((await rows()).filter((r) => r.type === 'followup.due')).toHaveLength(2);
  });

  it('skips completed tasks and suspended members', async () => {
    const { deps } = testDeps(db.pool);
    await db.pool.query(`UPDATE leads SET next_call_at = NULL`);
    await db.pool.query(`UPDATE tasks SET status = 'completed' WHERE id = $1`, [fx.taskA]);
    await notifications.scanReminders(deps);
    expect(await rows()).toEqual([]);
    await db.pool.query(`UPDATE tasks SET status = 'pending' WHERE id = $1`, [fx.taskA]);
    await db.pool.query(
      `UPDATE organization_memberships SET status = 'suspended' WHERE organization_id = $1 AND user_id = $2`,
      [fx.orgA, fx.users.aSales],
    );
    await notifications.scanReminders(deps);
    expect(await rows()).toEqual([]);
    await db.pool.query(
      `UPDATE organization_memberships SET status = 'active' WHERE organization_id = $1 AND user_id = $2`,
      [fx.orgA, fx.users.aSales],
    );
  });
});
