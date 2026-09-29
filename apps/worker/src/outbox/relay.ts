import type { DatabasePool } from '@crm/database';
import * as outbox from '../db/outbox.js';
import { errorInfo, type Logger } from '../logger.js';
import { outboxDispatchErrors } from '../metrics.js';
import type { QueueDriver } from '../queue/types.js';
import { routeEvent } from './routing.js';

export interface RelayOptions {
  db: DatabasePool;
  queue: QueueDriver;
  logger: Logger;
  workerId: string;
  batchSize: number;
  leaseSeconds: number;
  maxAttempts: number;
  pollMs: number;
}

/**
 * Outbox → queue relay. Claims due events (SKIP LOCKED lease), enqueues their
 * jobs, then marks them processed. If enqueueing fails (e.g. Redis down) the
 * event is released with backoff and retried; after `maxAttempts` it is
 * marked dead (kept for inspection) so it can never block newer events.
 * A crash anywhere leaves the event claimable again once the lease expires;
 * deterministic job ids make the re-dispatch a no-op for jobs already queued.
 */
export function createRelay(options: RelayOptions) {
  let running = false;
  let loop: Promise<void> | undefined;
  let wake: (() => void) | undefined;

  async function dispatchOnce(): Promise<number> {
    const claimed = await outbox.claimBatch(options.db, {
      limit: options.batchSize,
      leaseSeconds: options.leaseSeconds,
      workerId: options.workerId,
    });
    for (const item of claimed) {
      if (!item.event) {
        await outbox.markDead(options.db, item.id, `Invalid event: ${item.error ?? 'unknown'}`);
        options.logger.error('outbox_event_invalid', { eventId: item.id });
        continue;
      }
      const started = Date.now();
      try {
        for (const job of routeEvent(item.event)) await options.queue.enqueue(job);
        await outbox.markProcessed(options.db, item.id, options.workerId);
        options.logger.info('outbox_event_dispatched', {
          eventId: item.id,
          eventType: item.event.type,
          organizationId: item.event.organizationId,
          attempt: item.attempts,
          durationMs: Date.now() - started,
        });
      } catch (error) {
        outboxDispatchErrors.inc();
        const message = (error as Error).message ?? String(error);
        if (item.attempts >= options.maxAttempts) {
          await outbox.markDead(options.db, item.id, message);
          options.logger.error('outbox_event_dead', {
            eventId: item.id,
            attempt: item.attempts,
            ...errorInfo(error),
          });
        } else {
          const delay = Math.min(300, 2 ** item.attempts) + Math.random();
          await outbox.release(options.db, item.id, options.workerId, message, delay);
          options.logger.warn('outbox_event_retry', {
            eventId: item.id,
            attempt: item.attempts,
            ...errorInfo(error),
          });
        }
      }
    }
    return claimed.length;
  }

  return {
    dispatchOnce,
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      loop = (async () => {
        while (running) {
          let handled = 0;
          try {
            handled = await dispatchOnce();
          } catch (error) {
            options.logger.error('outbox_relay_error', errorInfo(error));
          }
          // Full batch: continue immediately. Otherwise sleep (interruptible), never busy-loop.
          if (running && handled < options.batchSize) {
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, options.pollMs);
              wake = () => {
                clearTimeout(timer);
                resolve();
              };
            });
          }
        }
      })();
    },
    async stop() {
      running = false;
      wake?.();
      await loop;
    },
  };
}
