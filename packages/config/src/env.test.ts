import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  EnvValidationError,
  booleanString,
  nodeEnvSchema,
  parseEnv,
  requiredInProduction,
} from './env.js';

const schema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    DATABASE_URL: z.string(),
    SECRET: z.string().optional(),
    FLAG: booleanString.default(false),
  })
  .superRefine(requiredInProduction(['SECRET']));

describe('parseEnv', () => {
  it('parses and applies defaults', () => {
    const env = parseEnv(schema, {
      appName: 'test',
      source: { DATABASE_URL: 'postgres://x', FLAG: 'yes' },
    });
    expect(env).toEqual({ NODE_ENV: 'development', DATABASE_URL: 'postgres://x', FLAG: true });
  });

  it('treats empty strings as missing and reports variable names', () => {
    expect(() =>
      parseEnv(schema, { appName: 'test', source: { DATABASE_URL: '  ' } }),
    ).toThrowError(/DATABASE_URL is required/);
  });

  it('enforces production-only requirements', () => {
    try {
      parseEnv(schema, { appName: 'api', source: { NODE_ENV: 'production', DATABASE_URL: 'x' } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues).toEqual(['SECRET is required in production']);
    }
  });

  it('never includes values in error messages', () => {
    const strict = z.object({ PORT: z.coerce.number().int() });
    try {
      parseEnv(strict, { appName: 'api', source: { PORT: 'super-secret-value' } });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret-value');
    }
  });
});
