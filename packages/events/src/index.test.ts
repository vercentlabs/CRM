import { describe, expect, it, vi } from 'vitest';
import {
  EVENT_DEFINITIONS,
  EVENT_TYPES,
  WEBHOOK_EVENT_TYPES,
  appendEvent,
  parsePayload,
  toDomainEvent,
} from './index.js';

const fakeDb = () => {
  const query = vi.fn(async (_sql: string, params: unknown[]) => ({ rows: [{ id: params[0] }] }));
  return { query } as unknown as { query: typeof query };
};

describe('event catalog', () => {
  it('versions every event and keeps webhook events tenant-scoped', () => {
    for (const type of EVENT_TYPES) expect(EVENT_DEFINITIONS[type].version).toBeGreaterThan(0);
    expect(WEBHOOK_EVENT_TYPES).not.toContain('auth.password_reset_requested');
    expect(WEBHOOK_EVENT_TYPES).not.toContain('file.deleted');
  });

  it('rejects malformed payloads', () => {
    expect(() => parsePayload('lead.assigned', { leadId: 'x' })).toThrow();
    expect(
      parsePayload('lead.assigned', { leadId: 1, assignedTo: 2, previousAssignedTo: null }),
    ).toEqual({ leadId: 1, assignedTo: 2, previousAssignedTo: null });
  });
});

describe('appendEvent', () => {
  it('writes a validated, versioned row with the aggregate id', async () => {
    const db = fakeDb();
    const id = await appendEvent(db as never, {
      type: 'lead.created',
      organizationId: 7,
      actorUserId: 3,
      aggregateId: 42,
      payload: { leadId: 42, assignedTo: null },
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const params = db.query.mock.calls[0]![1];
    expect(params.slice(1, 7)).toEqual([7, 'lead.created', 1, 'lead', '42', 3]);
    expect(JSON.parse(params[7] as string)).toEqual({ leadId: 42, assignedTo: null });
  });

  it('refuses tenant events without an organization and platform events with one', async () => {
    const db = fakeDb();
    await expect(
      appendEvent(db as never, {
        type: 'lead.created',
        organizationId: null,
        aggregateId: 1,
        payload: { leadId: 1, assignedTo: null },
      }),
    ).rejects.toThrow(/requires an organization/);
    await expect(
      appendEvent(db as never, {
        type: 'auth.password_reset_requested',
        organizationId: 1,
        aggregateId: 1,
        payload: { passwordResetId: 1 },
      }),
    ).rejects.toThrow(/platform event/);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('round-trips rows into typed events', () => {
    const event = toDomainEvent({
      id: 'e1',
      event_type: 'task.completed',
      event_version: 1,
      organization_id: 5,
      actor_user_id: null,
      aggregate_type: 'task',
      aggregate_id: '9',
      payload: { taskId: 9, assignedTo: 2 },
      occurred_at: new Date('2026-01-01T00:00:00Z'),
    });
    expect(event).toMatchObject({
      type: 'task.completed',
      organizationId: 5,
      payload: { taskId: 9 },
    });
    expect(() => toDomainEvent({ ...event, event_type: 'nope' } as never)).toThrow();
  });
});
