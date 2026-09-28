import 'dotenv/config';
import { nodeEnvSchema, parseEnv } from '@crm/config';
import { z } from 'zod';

const optional = z.string().optional();

/**
 * Environment contract for the API. Imported first by server.js so the process
 * fails fast with a readable list of missing keys (values are never printed).
 *
 * IMAGEKIT_* and PLIVO_AUTH_* are required because their SDK clients are
 * constructed at import time and already crash the process when missing.
 */
const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z.string(),

  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: optional,

  FRONTEND_URL: optional,

  IMAGEKIT_PUBLIC_KEY: z.string(),
  IMAGEKIT_PRIVATE_KEY: z.string(),
  IMAGEKIT_URL_ENDPOINT: z.string(),

  PLIVO_AUTH_ID: z.string(),
  PLIVO_AUTH_TOKEN: z.string(),
  PLIVO_PHONE_NUMBER: optional,
  PLIVO_WEBHOOK_URL: optional,

  EMAIL_HOST: optional,
  EMAIL_PORT: optional,
  EMAIL_SECURE: optional,
  EMAIL_USER: optional,
  EMAIL_PASS: optional,
  EMAIL_FROM: optional,

  GOLD_API_KEY: optional,
});

export type ApiEnv = z.output<typeof apiEnvSchema>;

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const env = parseEnv(apiEnvSchema, { appName: 'api', source });
  if (env.NODE_ENV === 'production' && env.JWT_SECRET.length < 32) {
    // Warn rather than fail so existing deployments keep booting; Phase 7 makes this fatal.
    console.warn(
      '[api] JWT_SECRET is shorter than 32 characters; rotate it to a long random value.',
    );
  }
  return env;
}

export const env: ApiEnv = loadApiEnv();
