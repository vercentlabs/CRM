import { z } from 'zod';

/**
 * Job catalog. A small set of logical queues; every job has a strict Zod
 * payload of identifiers only (authoritative data is re-read from PostgreSQL,
 * by organization) and an explicit retry policy. No secrets, tokens, message
 * bodies or recipient addresses ever enter Redis.
 */

export const QUEUE_NAMES = ['communications', 'notifications', 'webhooks', 'maintenance'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

const id = z.number().int().positive();
const uuid = z.uuid();
/** Tenant jobs: the organization is part of the payload and of every query. */
const tenant = { organizationId: id };

export interface RetryPolicy {
  attempts: number;
  /** Base delay of exponential backoff (jitter is added). */
  backoffMs: number;
}

interface JobDefinition<S extends z.ZodType> {
  queue: QueueName;
  schema: S;
  retry: RetryPolicy;
  /** Platform jobs run without a single organization (explicitly listed). */
  platform?: true;
}

const define = <S extends z.ZodType>(d: JobDefinition<S>) => d;

export const JOBS = {
  'message.send': define({
    queue: 'communications',
    schema: z.object({ ...tenant, messageId: id }).strict(),
    retry: { attempts: 5, backoffMs: 30_000 },
  }),
  'email.password_reset': define({
    queue: 'communications',
    schema: z.object({ passwordResetId: id }).strict(),
    retry: { attempts: 5, backoffMs: 30_000 },
    platform: true,
  }),
  'email.member_invitation': define({
    queue: 'communications',
    schema: z.object({ ...tenant, membershipId: id }).strict(),
    retry: { attempts: 5, backoffMs: 30_000 },
  }),
  'notification.event': define({
    queue: 'notifications',
    schema: z.object({ ...tenant, eventId: uuid }).strict(),
    retry: { attempts: 5, backoffMs: 5_000 },
  }),
  'webhook.fanout': define({
    queue: 'webhooks',
    schema: z.object({ ...tenant, eventId: uuid }).strict(),
    retry: { attempts: 5, backoffMs: 5_000 },
  }),
  'webhook.deliver': define({
    queue: 'webhooks',
    schema: z.object({ ...tenant, deliveryId: id }).strict(),
    retry: { attempts: 8, backoffMs: 60_000 },
  }),
  'file.delete_object': define({
    queue: 'maintenance',
    schema: z.object({ ...tenant, fileId: id }).strict(),
    retry: { attempts: 10, backoffMs: 60_000 },
  }),
  /** Recurring: due/overdue follow-up and task reminders (cross-tenant scan, per-row organization). */
  'reminders.scan': define({
    queue: 'maintenance',
    schema: z.object({}).strict(),
    retry: { attempts: 1, backoffMs: 0 },
    platform: true,
  }),
  /** Recurring: expired unattached uploads, stale provider deletions, processed outbox pruning. */
  'maintenance.sweep': define({
    queue: 'maintenance',
    schema: z.object({}).strict(),
    retry: { attempts: 1, backoffMs: 0 },
    platform: true,
  }),
} as const;

export type JobName = keyof typeof JOBS;
export type JobPayload<N extends JobName> = z.output<(typeof JOBS)[N]['schema']>;
export const JOB_NAMES = Object.keys(JOBS) as JobName[];

export const isJobName = (value: unknown): value is JobName =>
  typeof value === 'string' && value in JOBS;

/** Validates untrusted job data (from Redis) — never evaluated, only parsed. */
export function parseJob<N extends JobName>(name: N, data: unknown): JobPayload<N> {
  return JOBS[name].schema.parse(data) as JobPayload<N>;
}

/** BullMQ custom job ids may not contain ':'; ids are deterministic for dedupe. */
export const jobId = (...parts: Array<string | number>) => parts.join('.').replace(/:/g, '_');
