import { redact, redactError } from './redact.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** A logger that adds `fields` to every line. */
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  service: string;
  level?: LogLevel | undefined;
  /** Human-readable lines for local development; JSON otherwise (always JSON in production). */
  pretty?: boolean | undefined;
  /** Per-call context (e.g. request id, organization, user) from AsyncLocalStorage. */
  context?: (() => LogFields | undefined) | undefined;
  /** Output sink (tests); defaults to stdout/stderr. */
  write?: ((level: LogLevel, line: string) => void) | undefined;
  base?: LogFields | undefined;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const defaultWrite = (level: LogLevel, line: string) => {
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
};

/**
 * Structured logger: one JSON object per line with time, level, service,
 * build version, context ids and caller fields — every field redacted
 * centrally. This is the only place allowed to write logs to the console.
 */
export function createLogger(options: LoggerOptions): Logger {
  const threshold = ORDER[options.level ?? 'info'];
  const write = options.write ?? defaultWrite;
  const make = (bound: LogFields): Logger => {
    const emit = (level: LogLevel, msg: string, fields?: LogFields) => {
      if (ORDER[level] < threshold) return;
      const record = redact({
        time: new Date().toISOString(),
        level,
        msg,
        service: options.service,
        ...options.base,
        ...options.context?.(),
        ...bound,
        ...fields,
      }) as LogFields;
      if (options.pretty) {
        const { time, level: l, msg: m, service: _s, ...rest } = record;
        write(
          level,
          `${String(time).slice(11, 23)} ${String(l).toUpperCase().padEnd(5)} ${m}${Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ''}`,
        );
      } else {
        write(level, JSON.stringify(record));
      }
    };
    return {
      debug: (msg, fields) => emit('debug', msg, fields),
      info: (msg, fields) => emit('info', msg, fields),
      warn: (msg, fields) => emit('warn', msg, fields),
      error: (msg, fields) => emit('error', msg, fields),
      child: (fields) => make({ ...bound, ...fields }),
    };
  };
  return make({});
}

/** Error → safe log fields: `{ error: { name, code, message } }`. */
export const errorFields = (error: unknown, withStack = false): LogFields => ({
  error: redactError(error, withStack),
});

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

export const parseLogLevel = (value: string | undefined, fallback: LogLevel = 'info'): LogLevel =>
  value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : fallback;
