import { z } from 'zod';

/**
 * The domain event vocabulary. Every event type has an explicit version and a
 * Zod payload schema; a breaking payload change adds a new version instead of
 * editing an existing one. Payloads carry identifiers and small facts only —
 * consumers re-read authoritative state from PostgreSQL (by organization id).
 */

const id = z.number().int().positive();
const nullableId = id.nullable();
const isoDate = z.string().min(1);

export const EVENT_DEFINITIONS = {
  'lead.created': {
    version: 1,
    aggregate: 'lead',
    payload: z.object({ leadId: id, assignedTo: nullableId }),
  },
  'lead.assigned': {
    version: 1,
    aggregate: 'lead',
    payload: z.object({ leadId: id, assignedTo: nullableId, previousAssignedTo: nullableId }),
  },
  'lead.status_changed': {
    version: 1,
    aggregate: 'lead',
    payload: z.object({ leadId: id, from: z.string(), to: z.string() }),
  },
  'customer.created': {
    version: 1,
    aggregate: 'customer',
    payload: z.object({ customerId: id, leadId: nullableId }),
  },
  'opportunity.stage_changed': {
    version: 1,
    aggregate: 'opportunity',
    payload: z.object({
      opportunityId: id,
      from: z.string(),
      to: z.string(),
      assignedTo: nullableId,
    }),
  },
  'task.assigned': {
    version: 1,
    aggregate: 'task',
    payload: z.object({ taskId: id, assignedTo: id, dueDate: isoDate }),
  },
  'task.completed': {
    version: 1,
    aggregate: 'task',
    payload: z.object({ taskId: id, assignedTo: nullableId }),
  },
  'followup.scheduled': {
    version: 1,
    aggregate: 'followup',
    payload: z.object({ followupId: id, leadId: id, assignedTo: id, scheduledAt: isoDate }),
  },
  'message.requested': {
    version: 1,
    aggregate: 'message',
    payload: z.object({ messageId: id, leadId: id, channel: z.enum(['sms', 'whatsapp']) }),
  },
  'member.invited': {
    version: 1,
    aggregate: 'membership',
    payload: z.object({ membershipId: id, userId: id, roleKey: z.string() }),
  },
  'file.deleted': {
    version: 1,
    aggregate: 'file',
    payload: z.object({ fileId: id }),
  },
  /** Platform event (organization id NULL): the worker creates and emails the token. */
  'auth.password_reset_requested': {
    version: 1,
    aggregate: 'password_reset',
    payload: z.object({ passwordResetId: id }),
  },
} as const;

export type EventType = keyof typeof EVENT_DEFINITIONS;
export const EVENT_TYPES = Object.keys(EVENT_DEFINITIONS) as EventType[];

export type EventPayload<T extends EventType> = z.output<(typeof EVENT_DEFINITIONS)[T]['payload']>;

/** Event types an organization may subscribe to with an outbound webhook. */
export const WEBHOOK_EVENT_TYPES = [
  'lead.created',
  'lead.assigned',
  'lead.status_changed',
  'customer.created',
  'opportunity.stage_changed',
  'task.assigned',
  'task.completed',
  'followup.scheduled',
  'message.requested',
] as const satisfies readonly EventType[];

/** Events without an organization (global identities). */
export const PLATFORM_EVENT_TYPES = [
  'auth.password_reset_requested',
] as const satisfies readonly EventType[];

export const isEventType = (value: unknown): value is EventType =>
  typeof value === 'string' && value in EVENT_DEFINITIONS;

export const isPlatformEvent = (type: EventType) =>
  (PLATFORM_EVENT_TYPES as readonly string[]).includes(type);

/** A stored event as read back from the outbox. */
export interface DomainEvent<T extends EventType = EventType> {
  id: string;
  type: T;
  version: number;
  organizationId: number | null;
  actorUserId: number | null;
  aggregate: { type: string; id: string };
  payload: EventPayload<T>;
  occurredAt: string;
}

/** Validates a payload against its schema (used by the writer and by consumers). */
export function parsePayload<T extends EventType>(type: T, payload: unknown): EventPayload<T> {
  return EVENT_DEFINITIONS[type].payload.parse(payload) as EventPayload<T>;
}
