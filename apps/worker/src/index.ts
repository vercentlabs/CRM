import 'dotenv/config';
import { loadWorkerEnv } from './env.js';
import { createWorker } from './worker.js';

const env = loadWorkerEnv();
const worker = createWorker({
  heartbeatSeconds: env.WORKER_HEARTBEAT_SECONDS,
  queueUrl: env.REDIS_URL,
});

let stopping = false;
async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  await worker.stop(signal);
  process.exit(exitCode);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[worker] unhandled rejection', reason);
  void shutdown('unhandledRejection', 1);
});

await worker.start();
