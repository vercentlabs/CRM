export interface WorkerLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface JobContext {
  jobId: string;
  attempt: number;
  signal: AbortSignal;
}

/** Jobs are idempotent handlers keyed by name; Phase 6 binds them to a durable queue. */
export type JobHandler<TPayload = unknown> = (
  payload: TPayload,
  context: JobContext,
) => Promise<void>;

export interface WorkerOptions {
  heartbeatSeconds: number;
  queueUrl?: string | undefined;
  logger?: WorkerLogger;
}

export interface Worker {
  register<TPayload>(name: string, handler: JobHandler<TPayload>): void;
  jobNames(): string[];
  start(): Promise<void>;
  stop(reason?: string): Promise<void>;
  readonly running: boolean;
}

const consoleLogger: WorkerLogger = {
  info: (message) => console.log(`[worker] ${message}`),
  warn: (message) => console.warn(`[worker] ${message}`),
  error: (message, error) => console.error(`[worker] ${message}`, error ?? ''),
};

/**
 * Minimal worker lifecycle: register handlers, start, stop cleanly.
 * No queue backend is attached yet; in-flight work is tracked through an
 * AbortController so Phase 6 consumers can drain on shutdown.
 */
export function createWorker({
  heartbeatSeconds,
  queueUrl,
  logger = consoleLogger,
}: WorkerOptions): Worker {
  const handlers = new Map<string, JobHandler>();
  const controller = new AbortController();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let running = false;

  return {
    register(name, handler) {
      if (handlers.has(name)) throw new Error(`Job "${name}" is already registered`);
      handlers.set(name, handler as JobHandler);
    },

    jobNames: () => [...handlers.keys()],

    async start() {
      if (running) return;
      running = true;
      if (queueUrl) {
        logger.warn(
          'REDIS_URL is set but queue consumption is not implemented until Phase 6; ignoring.',
        );
      }
      logger.info(`started (queue: disabled, jobs: ${handlers.size})`);
      if (heartbeatSeconds > 0) {
        heartbeat = setInterval(() => logger.info('heartbeat'), heartbeatSeconds * 1000);
      }
    },

    async stop(reason = 'stop requested') {
      if (!running) return;
      running = false;
      if (heartbeat) clearInterval(heartbeat);
      controller.abort();
      logger.info(`stopped (${reason})`);
    },

    get running() {
      return running;
    },
  };
}
