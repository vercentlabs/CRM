import {
  buildInfo,
  createLogger,
  errorFields,
  silentLogger as silent,
  type LogFields,
  type Logger as ObservabilityLogger,
} from '@crm/observability';

/**
 * Worker logging through @crm/observability: JSON lines with build version
 * and central redaction (no tokens, secrets, message bodies or recipients).
 */
export type { LogFields };
export type Logger = ObservabilityLogger;

const build = buildInfo();

export const jsonLogger: Logger = createLogger({
  service: 'worker',
  level:
    (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | undefined) ??
    (process.env.NODE_ENV === 'test' ? 'error' : 'info'),
  pretty: process.env.NODE_ENV === 'development' && process.env.LOG_FORMAT !== 'json',
  base: { version: build.version, commit: build.commit },
});

export const silentLogger: Logger = silent;

/** Error → safe fields (name, code, first line of the message; redacted). */
export const errorInfo = (error: unknown): LogFields => errorFields(error);
