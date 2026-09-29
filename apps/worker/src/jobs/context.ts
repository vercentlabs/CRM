import type { DatabasePool } from '@crm/database';
import type { EmailSender, FileStorage, Resolver, SmsProvider } from '@crm/integrations';
import type { Logger } from '../logger.js';
import type { QueueDriver } from '../queue/types.js';

/** Everything a processor may use. Providers are interfaces (fakes in tests). */
export interface WorkerDeps {
  db: DatabasePool;
  queue: QueueDriver;
  email: EmailSender;
  sms: SmsProvider;
  storage: FileStorage;
  logger: Logger;
  config: {
    frontendUrl: string;
    /** Provider delivery-report URL for SMS (…/api/plivo/webhook/message-status). */
    smsStatusCallbackUrl?: string | undefined;
    webhookSecretKey?: Buffer | undefined;
    allowPrivateWebhookTargets: boolean;
    webhookTimeoutMs: number;
    outboxRetentionDays: number;
    /** Operational retention windows (maintenance.sweep). */
    retention?: {
      sessionDays: number;
      passwordResetDays: number;
      notificationDays: number;
      deliveryDays: number;
      deletedFileDays: number;
    };
    fetch: typeof fetch;
    resolver?: Resolver | undefined;
  };
}

export interface JobContext {
  id: string;
  attempt: number;
  maxAttempts: number;
  /** No further retry after this attempt: settle terminal state instead of throwing. */
  finalAttempt: boolean;
}
