import { JOBS, jobId } from '../jobs/definitions.js';
import type { EnqueueRequest, JobRunner, QueueDriver } from './types.js';
import { PermanentJobError } from './types.js';

/**
 * In-process driver for development and tests (no Redis). Same contract as
 * BullMQ: ids deduplicate, retries follow the job's policy, permanent errors
 * stop retries. Work is lost on restart — which is why production requires
 * Redis. `drain()` lets tests wait deterministically.
 */
export function createInlineDriver(options: { retryDelayMs?: number } = {}): QueueDriver & {
  drain(): Promise<void>;
  failed: Array<{ id: string; name: string; error: unknown }>;
  completed: string[];
} {
  const pending: Array<EnqueueRequest & { attempt: number }> = [];
  const seen = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const failed: Array<{ id: string; name: string; error: unknown }> = [];
  const completed: string[] = [];
  let runner: JobRunner | undefined;
  let active: Promise<void> | undefined;
  let closed = false;

  const pump = (): Promise<void> => {
    if (active || !runner || closed) return active ?? Promise.resolve();
    active = (async () => {
      while (pending.length > 0 && !closed) {
        const job = pending.shift()!;
        const maxAttempts = JOBS[job.name].retry.attempts;
        try {
          await runner!({
            id: job.id,
            name: job.name,
            data: job.payload,
            attempt: job.attempt,
            maxAttempts,
          });
          completed.push(job.id);
        } catch (error) {
          if (!(error instanceof PermanentJobError) && job.attempt < maxAttempts) {
            const retry = { ...job, attempt: job.attempt + 1 };
            const delay = options.retryDelayMs ?? 0;
            if (delay === 0) pending.push(retry);
            else {
              const timer = setTimeout(() => {
                timers.delete(timer);
                pending.push(retry);
                void pump();
              }, delay);
              timers.add(timer);
            }
          } else {
            failed.push({ id: job.id, name: job.name, error });
          }
        }
      }
    })().finally(() => {
      active = undefined;
    });
    return active;
  };

  const driver = {
    kind: 'inline' as const,
    failed,
    completed,
    async enqueue(request: EnqueueRequest) {
      if (closed) throw new Error('Queue is closed');
      if (seen.has(request.id)) return;
      seen.add(request.id);
      const push = () => {
        pending.push({ ...request, attempt: 1 });
        void pump();
      };
      if (request.delayMs && request.delayMs > 0) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          push();
        }, request.delayMs);
        timers.add(timer);
      } else push();
    },
    async schedule(name: EnqueueRequest['name'], everyMs: number) {
      const timer = setInterval(() => {
        void driver.enqueue({
          name,
          payload: {},
          id: jobId(name, Math.floor(Date.now() / everyMs)),
        });
      }, everyMs);
      timer.unref?.();
      timers.add(timer as unknown as ReturnType<typeof setTimeout>);
    },
    async start(run: JobRunner) {
      runner = run;
      await pump();
    },
    async drain() {
      while (pending.length > 0 || active) await (active ?? pump());
    },
    async close(timeoutMs: number) {
      closed = true;
      for (const timer of timers) clearTimeout(timer);
      if (active) {
        await Promise.race([active, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
      }
    },
    async ping() {
      return !closed;
    },
  };
  return driver;
}
