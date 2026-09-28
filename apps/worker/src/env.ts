import { booleanString, nodeEnvSchema, parseEnv } from '@crm/config';
import { z } from 'zod';

const optional = z.string().optional();
const int = (min: number, fallback: number) => z.coerce.number().int().min(min).default(fallback);

/**
 * Worker environment. Development/test may run without Redis (inline queue
 * driver, jobs execute in-process); production requires REDIS_URL and real
 * providers, and refuses the in-memory/log adapters.
 */
const workerEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    DATABASE_URL: z.string(),

    /** BullMQ backend. Required in production; without it jobs run inline (dev/test). */
    REDIS_URL: optional,
    QUEUE_PREFIX: z
      .string()
      .regex(/^[a-z0-9_-]{1,32}$/)
      .default('crm'),
    WORKER_CONCURRENCY: int(1, 5),
    /** Retention of finished jobs in Redis (failed jobs stay inspectable longer). */
    JOB_KEEP_COMPLETED_HOURS: int(1, 24),
    JOB_KEEP_FAILED_DAYS: int(1, 7),

    OUTBOX_POLL_MS: int(100, 1000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
    /** A claim older than this is considered abandoned (worker crash) and reclaimed. */
    OUTBOX_LEASE_SECONDS: int(5, 60),
    OUTBOX_MAX_ATTEMPTS: int(1, 10),
    OUTBOX_RETENTION_DAYS: int(1, 14),

    REMINDER_INTERVAL_SECONDS: int(10, 60),
    MAINTENANCE_INTERVAL_SECONDS: int(60, 900),
    /** Minimal liveness/readiness HTTP endpoint for container platforms (0 = off). */
    WORKER_HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(0),
    WORKER_SHUTDOWN_TIMEOUT_MS: int(1000, 25_000),

    FRONTEND_URL: optional,

    EMAIL_PROVIDER: z.enum(['smtp', 'memory']).default('smtp'),
    EMAIL_HOST: optional,
    EMAIL_PORT: optional,
    EMAIL_SECURE: optional,
    EMAIL_USER: optional,
    EMAIL_PASS: optional,
    EMAIL_FROM: optional,

    /** 'none' fails every SMS truthfully; 'log' is a development stand-in. */
    SMS_PROVIDER: z.enum(['plivo', 'log', 'none']).default('none'),
    PLIVO_AUTH_ID: optional,
    PLIVO_AUTH_TOKEN: optional,
    PLIVO_PHONE_NUMBER: optional,
    PLIVO_WEBHOOK_URL: optional,
    SMS_DEFAULT_COUNTRY_CODE: z
      .string()
      .regex(/^\d{1,3}$/)
      .optional(),

    STORAGE_PROVIDER: z.enum(['imagekit', 'memory']).default('imagekit'),
    IMAGEKIT_PUBLIC_KEY: optional,
    IMAGEKIT_PRIVATE_KEY: optional,
    IMAGEKIT_URL_ENDPOINT: optional,

    /** 32-byte key (base64/hex) that encrypts webhook signing secrets at rest. */
    WEBHOOK_SECRET_KEY: optional,
    /** Development only: allow http:// and private-network webhook targets. */
    WEBHOOK_ALLOW_PRIVATE_TARGETS: booleanString.optional(),
    WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(10_000),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (env.NODE_ENV === 'production') {
      if (!env.REDIS_URL) issue('REDIS_URL', 'Redis is required for queues in production');
      if (env.EMAIL_PROVIDER === 'memory')
        issue('EMAIL_PROVIDER', 'In-memory email is for development only');
      if (env.SMS_PROVIDER === 'log')
        issue('SMS_PROVIDER', 'The log SMS provider is for development only');
      if (env.STORAGE_PROVIDER === 'memory')
        issue('STORAGE_PROVIDER', 'In-memory storage is for development only');
      if (env.WEBHOOK_ALLOW_PRIVATE_TARGETS) {
        issue(
          'WEBHOOK_ALLOW_PRIVATE_TARGETS',
          'Private webhook targets are never allowed in production',
        );
      }
    }
    if (env.SMS_PROVIDER === 'plivo') {
      for (const key of ['PLIVO_AUTH_ID', 'PLIVO_AUTH_TOKEN', 'PLIVO_PHONE_NUMBER'] as const) {
        if (!env[key]) issue(key, 'Required when SMS_PROVIDER=plivo');
      }
    }
    if (env.STORAGE_PROVIDER === 'imagekit') {
      for (const key of [
        'IMAGEKIT_PUBLIC_KEY',
        'IMAGEKIT_PRIVATE_KEY',
        'IMAGEKIT_URL_ENDPOINT',
      ] as const) {
        if (!env[key]) issue(key, 'Required when STORAGE_PROVIDER=imagekit');
      }
    }
  });

export type WorkerEnv = z.output<typeof workerEnvSchema>;

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  return parseEnv(workerEnvSchema, { appName: 'worker', source });
}
