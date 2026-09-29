import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { Redis } from 'ioredis';
import { env } from './env.js';
import { AppError } from './http/errors.js';
import { errorFields, logger } from './logger.js';
import { rateLimitBlocks, rateLimitStoreErrors } from './metrics.js';

/**
 * Fixed-window rate limiting with a shared store. Production uses Redis (every
 * API instance shares the counters); development/test without REDIS_URL use
 * an in-process store. Keys are hashed, so emails never appear in Redis.
 * If the store fails, protected requests are refused (fail closed) — these
 * policies guard credentials and abuse-prone writes.
 */

export interface RateLimitStore {
  readonly kind: 'redis' | 'memory';
  /** Increments the window counter; returns the count and ms until reset. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetMs: number }>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createMemoryStore(): RateLimitStore {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    kind: 'memory',
    async hit(key, windowMs) {
      const now = Date.now();
      if (buckets.size > 10_000) {
        for (const [k, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(k);
      }
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return { count: bucket.count, resetMs: bucket.resetAt - now };
    },
    async reset() {
      buckets.clear();
    },
    async close() {
      buckets.clear();
    },
  };
}

// Atomic: increment, set the expiry on the first hit, return count + remaining ms.
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}`;

export function createRedisStore(url: string, prefix: string): RateLimitStore {
  const redis = new Redis(url, {
    lazyConnect: false,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    commandTimeout: 1_000,
  });
  let lastLog = 0;
  redis.on('error', (error) => {
    // Reconnect errors repeat; log at most once a minute (the URL/credentials are never logged).
    if (Date.now() - lastLog > 60_000) {
      lastLog = Date.now();
      logger.error('rate_limit_store_error', errorFields(error));
    }
  });
  /**
   * Commands are not queued while disconnected (a request must not hang). A
   * connection still being (re)established gets a short, bounded wait so a
   * fresh instance does not reject its first requests; after that: fail closed.
   */
  const connected = async () => {
    if (redis.status === 'ready') return;
    if (redis.status === 'end') throw new Error('Rate limit store closed');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        redis.off('ready', onReady);
        reject(new Error('Rate limit store unavailable'));
      }, 1_500);
      const onReady = () => {
        clearTimeout(timer);
        resolve();
      };
      redis.once('ready', onReady);
    });
  };
  return {
    kind: 'redis',
    async hit(key, windowMs) {
      await connected();
      const [count, ttl] = (await redis.eval(
        HIT_SCRIPT,
        1,
        `${prefix}:rl:${key}`,
        String(windowMs),
      )) as [number, number];
      return { count, resetMs: ttl > 0 ? ttl : windowMs };
    },
    async reset() {
      const keys = await redis.keys(`${prefix}:rl:*`);
      if (keys.length) await redis.del(...keys);
    },
    async close() {
      redis.disconnect();
    },
  };
}

let store: RateLimitStore = env.REDIS_URL
  ? createRedisStore(env.REDIS_URL, env.RATE_LIMIT_PREFIX)
  : createMemoryStore();

export const rateLimitStore = () => store;

/** Test seam. */
export function useRateLimitStore(next: RateLimitStore): void {
  store = next;
}

const digest = (value: string) =>
  createHash('sha256').update(value).digest('base64url').slice(0, 32);

export interface RateLimitPolicy {
  /** Metric label and key namespace (bounded set). */
  name: string;
  max: number;
  windowSeconds: number;
  /** Parts identifying the caller; each non-empty part is hashed into the key. */
  key: (req: Request) => Array<string | number | undefined>;
}

/**
 * Express middleware enforcing one or more policies (all must pass). Answers
 * 429 with Retry-After; never reveals which part (IP or email) tripped.
 */
export function rateLimit(...policies: RateLimitPolicy[]): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      for (const policy of policies) {
        const parts = policy.key(req).map((p) => (p === undefined ? '' : String(p)));
        const key = `${policy.name}:${digest(parts.join('|'))}`;
        let result;
        try {
          result = await store.hit(key, policy.windowSeconds * 1000);
        } catch (error) {
          rateLimitStoreErrors.inc();
          logger.error('rate_limit_unavailable', { policy: policy.name, ...errorFields(error) });
          throw new AppError('SERVICE_UNAVAILABLE', 'Please try again shortly');
        }
        if (result.count > policy.max) {
          rateLimitBlocks.inc({ policy: policy.name });
          res.setHeader('Retry-After', String(Math.max(1, Math.ceil(result.resetMs / 1000))));
          throw new AppError('RATE_LIMITED', 'Too many attempts, please try again later');
        }
      }
    })().then(() => next(), next);
  };
}

export function emailKey(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

const ip = (req: Request) => req.ip ?? 'unknown';
const user = (req: Request) => req.auth?.userId;
const minute = 60;

/** Endpoint policies (thresholds from env; documented in docs/operations/ENVIRONMENTS.md). */
export const policies = {
  /** Brute force against one account from one address (generic errors keep enumeration closed). */
  loginAccount: {
    name: 'login_account',
    max: env.AUTH_RATE_LIMIT_MAX,
    windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    key: (req) => [ip(req), emailKey(req)],
  },
  /** Credential stuffing across many accounts from one address. */
  loginIp: {
    name: 'login_ip',
    max: env.AUTH_RATE_LIMIT_IP_MAX,
    windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    key: (req) => [ip(req)],
  },
  refresh: {
    name: 'refresh',
    max: env.AUTH_RATE_LIMIT_MAX * 6,
    windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    key: (req) => [ip(req)],
  },
  passwordReset: {
    name: 'password_reset',
    max: env.AUTH_RATE_LIMIT_MAX,
    windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    key: (req) => [ip(req), emailKey(req)],
  },
  passwordResetIp: {
    name: 'password_reset_ip',
    max: env.AUTH_RATE_LIMIT_IP_MAX,
    windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    key: (req) => [ip(req)],
  },
  invitation: {
    name: 'invitation',
    max: 20,
    windowSeconds: 15 * minute,
    key: (req) => [user(req) ?? ip(req)],
  },
  /** Member management, uploads, outbound messaging, webhook management — per member. */
  sensitive: {
    name: 'sensitive_write',
    max: env.SENSITIVE_RATE_LIMIT_PER_MINUTE,
    windowSeconds: minute,
    key: (req) => [user(req) ?? ip(req)],
  },
} satisfies Record<string, RateLimitPolicy>;
