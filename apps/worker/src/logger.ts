/**
 * Structured JSON logs (one line per event). Callers pass identifiers and
 * safe codes only — never tokens, secrets, passwords or message bodies.
 */
export type LogFields = Record<string, unknown>;

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

function write(level: 'info' | 'warn' | 'error', msg: string, fields: LogFields = {}) {
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    service: 'worker',
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const jsonLogger: Logger = {
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
};

export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Error → safe fields: name, code and first line of the message (no stack, no cause chain). */
export function errorInfo(error: unknown): LogFields {
  if (!(error instanceof Error)) return { error: String(error).slice(0, 200) };
  const code = (error as { code?: unknown }).code;
  return {
    error: {
      name: error.name,
      ...(typeof code === 'string' ? { code } : {}),
      message: error.message.split('\n')[0]!.slice(0, 200),
    },
  };
}
