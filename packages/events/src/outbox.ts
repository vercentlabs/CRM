import { randomUUID } from 'node:crypto';
import type { Queryable } from '@crm/database';
import {
  EVENT_DEFINITIONS,
  isPlatformEvent,
  parsePayload,
  type DomainEvent,
  type EventPayload,
  type EventType,
} from './catalog.js';

export interface NewEvent<T extends EventType> {
  type: T;
  /** Required for every tenant event; NULL only for platform events. */
  organizationId: number | null;
  actorUserId?: number | null | undefined;
  aggregateId: number | string;
  payload: EventPayload<T>;
  /** Optional idempotency key: a second insert with the same key is a no-op. */
  dedupeKey?: string | undefined;
  availableAt?: Date | undefined;
}

/**
 * Appends an event to the transactional outbox. Pass the SAME transaction
 * client that performs the domain change, so the event exists if and only if
 * the change commits. Returns the event id (or null when deduplicated).
 */
export async function appendEvent<T extends EventType>(
  db: Queryable,
  event: NewEvent<T>,
): Promise<string | null> {
  const definition = EVENT_DEFINITIONS[event.type];
  const platform = isPlatformEvent(event.type);
  if (platform && event.organizationId !== null) {
    throw new Error(`${event.type} is a platform event and has no organization`);
  }
  if (!platform && event.organizationId === null) {
    throw new Error(`${event.type} requires an organization id`);
  }
  const payload = parsePayload(event.type, event.payload);
  const id = randomUUID();
  const result = await db.query(
    `INSERT INTO outbox_events
       (id, organization_id, event_type, event_version, aggregate_type, aggregate_id,
        actor_user_id, payload, dedupe_key, available_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, now()))
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      id,
      event.organizationId,
      event.type,
      definition.version,
      definition.aggregate,
      String(event.aggregateId),
      event.actorUserId ?? null,
      JSON.stringify(payload),
      event.dedupeKey ?? null,
      event.availableAt ?? null,
    ],
  );
  return (result.rows[0] as { id: string } | undefined)?.id ?? null;
}

/** Outbox row → DomainEvent (payload re-validated against its schema). */
export function toDomainEvent(row: {
  id: string;
  event_type: string;
  event_version: number;
  organization_id: number | null;
  actor_user_id: number | null;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  occurred_at: Date | string;
}): DomainEvent {
  const type = row.event_type as EventType;
  if (!(type in EVENT_DEFINITIONS)) throw new Error(`Unknown event type ${row.event_type}`);
  return {
    id: row.id,
    type,
    version: row.event_version,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    aggregate: { type: row.aggregate_type, id: row.aggregate_id },
    payload: parsePayload(type, row.payload),
    occurredAt: new Date(row.occurred_at).toISOString(),
  };
}
