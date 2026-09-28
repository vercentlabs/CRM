import { getRequestId } from './request-context.js';

/**
 * Minimal structured logger: one JSON line per event on stderr/stdout with the
 * current request id. Full observability (shipping, tracing) is Phase 6.
 */

type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

function write(level: Level, msg: string, fields: Fields = {}): void {
  const requestId = getRequestId();
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...(requestId ? { requestId } : {}),
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Error → loggable fields (message and name only unless a stack is requested). */
export function errorFields(error: unknown, withStack = false): Fields {
  if (!(error instanceof Error)) return { error: String(error) };
  return {
    error: {
      name: error.name,
      message: error.message,
      ...(withStack ? { stack: error.stack } : {}),
    },
  };
}

export const logger = {
  info: (msg: string, fields?: Fields) => write('info', msg, fields),
  warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
  error: (msg: string, fields?: Fields) => write('error', msg, fields),
};
