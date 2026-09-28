import type { JobName } from '../jobs/definitions.js';

export interface EnqueueRequest {
  name: JobName;
  payload: unknown;
  /** Deterministic id: enqueuing the same id twice is a no-op while the job is retained. */
  id: string;
  delayMs?: number;
}

export interface RunningJob {
  id: string;
  name: string;
  data: unknown;
  /** 1-based attempt number. */
  attempt: number;
  maxAttempts: number;
}

export type JobRunner = (job: RunningJob) => Promise<void>;

/** Raised by processors for failures that must not be retried (bad payload, permanent provider rejection). */
export class PermanentJobError extends Error {
  constructor(
    message: string,
    readonly code = 'PERMANENT_FAILURE',
  ) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

/**
 * Queue backend. `enqueue` resolves only once the job is durably accepted
 * (BullMQ: stored in Redis) and rejects otherwise — callers never assume
 * success when the backend is down.
 */
export interface QueueDriver {
  readonly kind: 'bullmq' | 'inline';
  enqueue(request: EnqueueRequest): Promise<void>;
  /** Recurring job (one schedule shared by all workers). */
  schedule(name: JobName, everyMs: number): Promise<void>;
  start(run: JobRunner): Promise<void>;
  /** Stop taking work, let active jobs finish (bounded), close connections. */
  close(timeoutMs: number): Promise<void>;
  ping(): Promise<boolean>;
}
