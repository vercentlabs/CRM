import { nodeEnvSchema, parseEnv } from '@crm/config';
import { z } from 'zod';

const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  WORKER_HEARTBEAT_SECONDS: z.coerce.number().int().min(0).default(60),
  /** Reserved for the Phase 6 Redis-backed queue. */
  REDIS_URL: z.string().optional(),
});

export type WorkerEnv = z.output<typeof workerEnvSchema>;

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  return parseEnv(workerEnvSchema, { appName: 'worker', source });
}
