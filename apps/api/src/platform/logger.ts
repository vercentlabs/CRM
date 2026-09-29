import { buildInfo, createLogger, errorFields as safeErrorFields } from '@crm/observability';
import { getRequestContext } from './request-context.js';

/**
 * The API's structured logger (@crm/observability): JSON lines with build
 * version, request id and — once authenticated — organization and user ids;
 * every field passes central redaction. Development uses readable lines.
 */
const build = buildInfo();

export const logger = createLogger({
  service: 'api',
  level:
    (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | undefined) ??
    (process.env.NODE_ENV === 'test' ? 'warn' : 'info'),
  pretty: process.env.NODE_ENV === 'development' && process.env.LOG_FORMAT !== 'json',
  base: { version: build.version, commit: build.commit },
  context: () => {
    const context = getRequestContext();
    if (!context) return undefined;
    return {
      requestId: context.requestId,
      ...(context.auth
        ? { organizationId: context.auth.organizationId, userId: context.auth.userId }
        : {}),
    };
  },
});

/** Error → loggable fields (name, code and first line of the message; redacted). */
export const errorFields = safeErrorFields;
