import { describe, expect, it } from 'vitest';
import { getRoleName, ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from './constants';
import { formatDate, formatNumber, formatPercentage } from './formatters';

describe('formatters', () => {
  it('formats percentages and guards invalid input', () => {
    expect(formatPercentage(12.345)).toBe('12.35%');
    expect(formatPercentage(null)).toBe('0%');
    expect(formatPercentage('abc')).toBe('0%');
  });

  it('formats numbers with separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(undefined)).toBe('0');
  });

  it('returns an empty string for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('');
    expect(formatDate(null)).toBe('');
  });
});

describe('role constants', () => {
  it('keeps the legacy role ids expected by the API', () => {
    expect([ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]).toEqual([1, 2, 3]);
    expect(getRoleName(ROLE_ADMIN)).toBe('Administrator');
  });
});
