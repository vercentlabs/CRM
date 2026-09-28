import type { Request, RequestHandler } from 'express';
import { AppError } from './http/errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window, in-process limiter for credential endpoints. Good enough for a
 * single API instance; Phase 7 swaps the store for a shared one (Redis) when
 * the API scales horizontally. Keys include the email so one attacker cannot
 * lock out every user behind a shared IP.
 */
export function createRateLimiter(options: {
  name: string;
  max: number;
  windowSeconds: number;
  key?: (req: Request) => string;
}): RequestHandler & { reset(): void } {
  const buckets = new Map<string, Bucket>();
  const windowMs = options.windowSeconds * 1000;

  const handler = ((req, res, next) => {
    const now = Date.now();
    if (buckets.size > 10_000) {
      for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
    }
    const key = `${options.name}:${req.ip ?? 'unknown'}:${options.key?.(req) ?? ''}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return next(new AppError('RATE_LIMITED', 'Too many attempts, please try again later'));
    }
    next();
  }) as RequestHandler & { reset(): void };

  handler.reset = () => buckets.clear();
  return handler;
}

export function emailKey(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}
