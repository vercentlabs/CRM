import { EnvValidationError } from '@crm/config';
import { describe, expect, it } from 'vitest';
import { loadApiEnv } from './env.js';

const complete = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/crm',
  JWT_SECRET: 'x'.repeat(40),
  IMAGEKIT_PUBLIC_KEY: 'pub',
  IMAGEKIT_PRIVATE_KEY: 'priv',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/x',
  PLIVO_AUTH_ID: 'id',
  PLIVO_AUTH_TOKEN: 'token',
};

describe('loadApiEnv', () => {
  it('applies defaults', () => {
    const env = loadApiEnv(complete);
    expect(env.PORT).toBe(5000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('fails clearly when mandatory secrets are missing, without echoing values', () => {
    const { JWT_SECRET: _omit, ...rest } = complete;
    try {
      loadApiEnv({ ...rest, DATABASE_URL: '' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL is required');
      expect(message).toContain('JWT_SECRET is required');
      expect(message).not.toContain('priv');
    }
  });
});
