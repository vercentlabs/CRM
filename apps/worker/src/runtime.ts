import { hostname } from 'node:os';
import { createPool } from '@crm/database';
import {
  createImageKitStorage,
  createLogSms,
  createMemoryEmailSender,
  createMemoryStorage,
  createPlivoSms,
  createSmtpSender,
  noSmsProvider,
  parseSecretKey,
  plivoCallbackUrls,
} from '@crm/integrations';
import { databaseSsl, type WorkerEnv } from './env.js';
import type { WorkerDeps } from './jobs/context.js';
import { jsonLogger, type Logger } from './logger.js';
import { createBullmqDriver } from './queue/bullmq.js';
import { createInlineDriver } from './queue/inline.js';
import type { WorkerOptions } from './worker.js';

/** Builds providers, queue driver and options from the validated environment. */
export function createRuntime(
  env: WorkerEnv,
  logger: Logger = jsonLogger,
): { deps: WorkerDeps; options: WorkerOptions } {
  const db = createPool({
    connectionString: env.DATABASE_URL,
    max: env.WORKER_CONCURRENCY + 4,
    ssl: databaseSsl(env),
    applicationName: 'crm-worker',
  });
  const queue = env.REDIS_URL
    ? createBullmqDriver({
        url: env.REDIS_URL,
        prefix: env.QUEUE_PREFIX,
        concurrency: env.WORKER_CONCURRENCY,
        keepCompletedHours: env.JOB_KEEP_COMPLETED_HOURS,
        keepFailedDays: env.JOB_KEEP_FAILED_DAYS,
        logger,
      })
    : createInlineDriver({ retryDelayMs: 5_000 });
  if (!env.REDIS_URL)
    logger.warn('queue_inline_mode', {
      note: 'REDIS_URL not set: jobs run in-process and are lost on restart (development only)',
    });

  const sms =
    env.SMS_PROVIDER === 'plivo'
      ? createPlivoSms({
          authId: env.PLIVO_AUTH_ID!,
          authToken: env.PLIVO_AUTH_TOKEN!,
          from: env.PLIVO_PHONE_NUMBER!,
          defaultCountryCode: env.SMS_DEFAULT_COUNTRY_CODE,
        })
      : env.SMS_PROVIDER === 'log'
        ? createLogSms()
        : noSmsProvider;

  const deps: WorkerDeps = {
    db,
    queue,
    logger,
    sms,
    email:
      env.EMAIL_PROVIDER === 'memory'
        ? createMemoryEmailSender()
        : createSmtpSender({
            host: env.EMAIL_HOST,
            port: env.EMAIL_PORT ? Number(env.EMAIL_PORT) : undefined,
            secure: env.EMAIL_SECURE === 'true',
            user: env.EMAIL_USER,
            pass: env.EMAIL_PASS,
            from: env.EMAIL_FROM,
          }),
    storage:
      env.STORAGE_PROVIDER === 'memory'
        ? createMemoryStorage()
        : createImageKitStorage({
            publicKey: env.IMAGEKIT_PUBLIC_KEY!,
            privateKey: env.IMAGEKIT_PRIVATE_KEY!,
            urlEndpoint: env.IMAGEKIT_URL_ENDPOINT!,
          }),
    config: {
      frontendUrl: env.FRONTEND_URL ?? 'http://localhost:3000',
      smsStatusCallbackUrl: env.PLIVO_WEBHOOK_URL
        ? plivoCallbackUrls(env.PLIVO_WEBHOOK_URL).messageStatus
        : undefined,
      webhookSecretKey: env.WEBHOOK_SECRET_KEY ? parseSecretKey(env.WEBHOOK_SECRET_KEY) : undefined,
      allowPrivateWebhookTargets:
        env.WEBHOOK_ALLOW_PRIVATE_TARGETS ?? env.NODE_ENV !== 'production',
      webhookTimeoutMs: env.WEBHOOK_TIMEOUT_MS,
      outboxRetentionDays: env.OUTBOX_RETENTION_DAYS,
      retention: {
        sessionDays: env.SESSION_RETENTION_DAYS,
        passwordResetDays: env.PASSWORD_RESET_RETENTION_DAYS,
        notificationDays: env.NOTIFICATION_RETENTION_DAYS,
        deliveryDays: env.DELIVERY_RETENTION_DAYS,
        deletedFileDays: env.DELETED_FILE_RETENTION_DAYS,
      },
      fetch: globalThis.fetch,
    },
  };

  const options: WorkerOptions = {
    workerId: `${hostname()}:${process.pid}`,
    outbox: {
      batchSize: env.OUTBOX_BATCH_SIZE,
      leaseSeconds: env.OUTBOX_LEASE_SECONDS,
      maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
      pollMs: env.OUTBOX_POLL_MS,
    },
    schedules: {
      remindersMs: env.REMINDER_INTERVAL_SECONDS * 1000,
      maintenanceMs: env.MAINTENANCE_INTERVAL_SECONDS * 1000,
    },
    healthPort: env.WORKER_HEALTH_PORT,
    shutdownTimeoutMs: env.WORKER_SHUTDOWN_TIMEOUT_MS,
    closeDatabase: true,
    metricsToken: env.METRICS_TOKEN,
    requireDurableQueue: env.NODE_ENV === 'production',
  };
  return { deps, options };
}
