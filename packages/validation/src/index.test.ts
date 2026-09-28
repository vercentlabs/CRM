import { describe, expect, it } from 'vitest';
import {
  idParamSchema,
  loginRequestSchema,
  paginationQuerySchema,
  toFieldIssues,
} from './index.js';

describe('loginRequestSchema', () => {
  it('accepts valid credentials', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: 'abcdefg1' }).success).toBe(
      true,
    );
  });

  it.each([
    [{ password: 'abcdefg1' }, 'email', 'Email is required'],
    [{ email: 'nope', password: 'abcdefg1' }, 'email', 'Invalid email format'],
    [
      { email: 'a@b.co', password: 'short1' },
      'password',
      'Password must be at least 8 characters long',
    ],
    [
      { email: 'a@b.co', password: 'onlyletters' },
      'password',
      'Password must contain at least one letter and one number',
    ],
  ])('rejects %j', (input, field, message) => {
    const result = loginRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldIssues(result.error)).toContainEqual({ field, message });
    }
  });
});

describe('common schemas', () => {
  it('coerces ids and pagination from query strings', () => {
    expect(idParamSchema.parse({ id: '12' })).toEqual({ id: 12 });
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
});
