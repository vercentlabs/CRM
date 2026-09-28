/**
 * Provider failures with a retry classification. `code` and `message` are
 * safe to store and log (no credentials, tokens or recipient content).
 */
export class ProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    /** Permanent failures (bad request, rejected recipient) must not be retried. */
    readonly permanent: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

export const isProviderError = (error: unknown): error is ProviderError =>
  error instanceof ProviderError;

/** Rejects after `ms` with a transient TIMEOUT ProviderError; never hangs a worker. */
export async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ProviderError('TIMEOUT', `${label} timed out after ${ms}ms`, false)),
      ms,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** HTTP-ish status → permanent? (4xx except 408/409/425/429 is permanent). */
export const isPermanentStatus = (status: number | undefined) =>
  status !== undefined && status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);

/** Short, log-safe message from an unknown error (first line, bounded length). */
export const safeMessage = (error: unknown, max = 200) =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0]!.slice(0, max);
