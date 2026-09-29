import type { LogFields, Logger } from './logger.js';
import { redact, redactError } from './redact.js';

/**
 * Provider-neutral error reporting. The default reporter writes a structured
 * log line; a vendor adapter (Sentry, an OpenTelemetry collector, a cloud
 * error service) implements the same interface and is installed with
 * `setErrorReporter` at startup. Context is redacted before any adapter sees it.
 */
export interface ErrorContext {
  requestId?: string | undefined;
  route?: string | undefined;
  method?: string | undefined;
  organizationId?: number | undefined;
  userId?: number | undefined;
  jobId?: string | undefined;
  jobName?: string | undefined;
  eventId?: string | undefined;
  [key: string]: unknown;
}

export interface ErrorReporter {
  readonly name: string;
  capture(error: unknown, context: ErrorContext): void;
}

export function logErrorReporter(logger: Logger): ErrorReporter {
  return {
    name: 'log',
    capture(error, context) {
      logger.error('error_captured', {
        ...(redact(context) as LogFields),
        error: redactError(error, true),
      });
    },
  };
}

let reporter: ErrorReporter | undefined;

export function setErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

export function captureError(error: unknown, context: ErrorContext = {}): void {
  try {
    reporter?.capture(error, redact(context) as ErrorContext);
  } catch {
    // Reporting must never break the caller.
  }
}
