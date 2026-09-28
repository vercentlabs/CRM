import { describe, expect, it } from 'vitest';
import {
  FEATURE_KEYS,
  getLimit,
  isFeatureEnabled,
  resolveEntitlements,
  withinLimit,
} from './index.js';

const plan = { key: 'base', name: 'Base' };

describe('resolveEntitlements', () => {
  it('enables what the plan grants and treats a missing value as unlimited', () => {
    const e = resolveEntitlements(plan, 'active', [
      { key: 'reports.export', enabled: true, limit_value: null },
      { key: 'seats', enabled: true, limit_value: '5' },
      { key: 'storage.bytes', enabled: true, limit_value: null },
      { key: 'something.unknown', enabled: true, limit_value: null },
    ]);
    expect(isFeatureEnabled(e, 'reports.export')).toBe(true);
    expect(getLimit(e, 'seats')).toBe(5);
    expect(getLimit(e, 'storage.bytes')).toBeNull();
    expect(Object.keys(e.features)).toEqual([...FEATURE_KEYS]);
  });

  it('fails closed for missing features and disabled limits', () => {
    const e = resolveEntitlements(plan, 'active', [
      { key: 'seats', enabled: false, limit_value: 9 },
    ]);
    expect(isFeatureEnabled(e, 'messages.bulk')).toBe(false);
    expect(getLimit(e, 'seats')).toBe(0);
    expect(getLimit(e, 'storage.bytes')).toBe(0);
  });

  it('checks limits inclusively', () => {
    expect(withinLimit(null, 10_000)).toBe(true);
    expect(withinLimit(3, 2)).toBe(true);
    expect(withinLimit(3, 3)).toBe(false);
    expect(withinLimit(100, 60, 50)).toBe(false);
  });
});
