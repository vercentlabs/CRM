import { afterEach, describe, expect, it } from 'vitest';
import {
  displayTimeZone,
  formatTime,
  isToday,
  setDisplayTimeZone,
  toDateTimeInput,
  toIsoOrNull,
} from '@/lib/format';

describe('organization time zone formatting', () => {
  afterEach(() => setDisplayTimeZone('UTC'));

  it('renders and edits in the organization zone, not the browser zone', () => {
    setDisplayTimeZone('Asia/Kolkata');
    expect(displayTimeZone()).toBe('Asia/Kolkata');
    expect(toDateTimeInput('2026-07-01T18:45:00Z')).toBe('2026-07-02T00:15');
    expect(toIsoOrNull('2026-07-02T00:15')).toBe('2026-07-01T18:45:00.000Z');
    expect(formatTime('2026-07-01T18:45:00Z')).toMatch(/12:15|00:15/);
    expect(isToday('2026-07-01T19:00:00Z', new Date('2026-07-02T05:00:00Z'))).toBe(true);
  });

  it('handles DST in America/New_York', () => {
    setDisplayTimeZone('America/New_York');
    expect(toDateTimeInput('2026-01-15T15:00:00Z')).toBe('2026-01-15T10:00');
    expect(toDateTimeInput('2026-07-15T15:00:00Z')).toBe('2026-07-15T11:00');
    expect(toIsoOrNull('2026-03-08T02:30')).toBe('2026-03-08T07:30:00.000Z');
    expect(toIsoOrNull('2026-11-01T01:30')).toBe('2026-11-01T05:30:00.000Z');
    expect(toIsoOrNull('2026-03-08')).toBe('2026-03-08T05:00:00.000Z');
  });

  it('falls back to UTC for invalid zones and rejects invalid input', () => {
    setDisplayTimeZone('Nope/Nope');
    expect(displayTimeZone()).toBe('UTC');
    expect(toDateTimeInput('2026-07-01T18:45:00Z')).toBe('2026-07-01T18:45');
    expect(toIsoOrNull('')).toBeNull();
    expect(toIsoOrNull('garbage')).toBeNull();
  });
});
