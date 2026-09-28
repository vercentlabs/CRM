import type { DatabaseClient } from '@crm/database';
import { appendEvent, type EventPayload, type EventType } from '@crm/events';
import type { Actor } from './tenancy.js';

/**
 * The approved way for services to publish domain events: always with the
 * transaction client (`DatabaseClient`, not the pool) of the change the event
 * describes, so the outbox row commits or rolls back together with it.
 * Organization and actor come from the verified session, never from input.
 */
export function emit<T extends EventType>(
  tx: DatabaseClient,
  actor: Actor,
  type: T,
  aggregateId: number,
  payload: EventPayload<T>,
): Promise<string | null> {
  return appendEvent(tx, {
    type,
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    aggregateId,
    payload,
  });
}
