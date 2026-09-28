import { describe, expect, it, vi } from 'vitest';
import { loadWorkerEnv } from './env.js';
import { createWorker } from './worker.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('worker lifecycle', () => {
  it('starts and stops cleanly and is idempotent', async () => {
    vi.useFakeTimers();
    const worker = createWorker({ heartbeatSeconds: 1, logger });
    await worker.start();
    await worker.start();
    expect(worker.running).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(logger.info).toHaveBeenCalledWith('heartbeat');

    await worker.stop('test');
    await worker.stop('test');
    expect(worker.running).toBe(false);
    logger.info.mockClear();
    vi.advanceTimersByTime(5_000);
    expect(logger.info).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('rejects duplicate job registrations', () => {
    const worker = createWorker({ heartbeatSeconds: 0, logger });
    worker.register('email.send', async () => undefined);
    expect(() => worker.register('email.send', async () => undefined)).toThrow(
      /already registered/,
    );
    expect(worker.jobNames()).toEqual(['email.send']);
  });

  it('warns that queues are disabled when REDIS_URL is set', async () => {
    const worker = createWorker({ heartbeatSeconds: 0, queueUrl: 'redis://localhost', logger });
    await worker.start();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Phase 6'));
    await worker.stop();
  });

  it('validates its environment', () => {
    expect(loadWorkerEnv({}).WORKER_HEARTBEAT_SECONDS).toBe(60);
    expect(() => loadWorkerEnv({ WORKER_HEARTBEAT_SECONDS: '-1' })).toThrow(
      /WORKER_HEARTBEAT_SECONDS/,
    );
  });
});
