import 'dotenv/config';
import { loadWorkerEnv } from './env.js';
import { errorInfo, jsonLogger } from './logger.js';
import { createRuntime } from './runtime.js';
import { createWorker } from './worker.js';

const env = loadWorkerEnv();
const { deps, options } = createRuntime(env);
const worker = createWorker(deps, options);

let stopping = false;
async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  // Hard stop if graceful shutdown overruns the platform's grace period.
  const forceExit = setTimeout(() => process.exit(1), options.shutdownTimeoutMs + 5_000);
  forceExit.unref();
  await worker.stop(signal);
  process.exit(exitCode);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  jsonLogger.error('unhandled_rejection', errorInfo(reason));
  void shutdown('unhandledRejection', 1);
});

try {
  await worker.start();
} catch (error) {
  jsonLogger.error('worker_start_failed', errorInfo(error));
  await shutdown('startup failure', 1);
}
