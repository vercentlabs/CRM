import { describe, expect, it } from 'vitest';
import {
  formatInTimeZone,
  isValidTimeZone,
  resolveTimeZone,
  startOfDayInTimeZone,
  timeZoneOffsetMinutes,
  zonedParts,
  zonedTimeToUtc,
} from './timezone.js';

describe('organization time zone', () => {
  it('validates IANA names and falls back safely', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
    expect(resolveTimeZone('"Asia/Kolkata"')).toBe('Asia/Kolkata');
    expect(resolveTimeZone(' America/New_York ')).toBe('America/New_York');
    expect(resolveTimeZone('Nope/Nope')).toBe('UTC');
    expect(resolveTimeZone(undefined)).toBe('UTC');
    expect(
      formatInTimeZone(
        '2026-01-01T00:00:00Z',
        'Nope/Nope',
        { timeStyle: 'short', hour12: false },
        'en-GB',
      ),
    ).toBe('00:00');
  });

  it('Asia/Kolkata has a fixed +05:30 offset (no DST)', () => {
    expect(timeZoneOffsetMinutes('2026-01-15T12:00:00Z', 'Asia/Kolkata')).toBe(330);
    expect(timeZoneOffsetMinutes('2026-07-15T12:00:00Z', 'Asia/Kolkata')).toBe(330);
    expect(zonedParts('2026-03-31T20:00:00Z', 'Asia/Kolkata')).toMatchObject({
      month: 4,
      day: 1,
      hour: 1,
      minute: 30,
    });
    expect(startOfDayInTimeZone('2026-03-31T20:00:00Z', 'Asia/Kolkata').toISOString()).toBe(
      '2026-03-31T18:30:00.000Z',
    );
  });

  it('America/New_York switches offset across DST', () => {
    expect(timeZoneOffsetMinutes('2026-01-15T12:00:00Z', 'America/New_York')).toBe(-300);
    expect(timeZoneOffsetMinutes('2026-07-15T12:00:00Z', 'America/New_York')).toBe(-240);
    // 2026-03-08: clocks jump 02:00 → 03:00.
    expect(timeZoneOffsetMinutes('2026-03-08T06:59:00Z', 'America/New_York')).toBe(-300);
    expect(timeZoneOffsetMinutes('2026-03-08T07:00:00Z', 'America/New_York')).toBe(-240);
    // Midnight of a DST day is still correct.
    expect(startOfDayInTimeZone('2026-03-08T15:00:00Z', 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(startOfDayInTimeZone('2026-11-01T15:00:00Z', 'America/New_York').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
  });

  it('resolves nonexistent and ambiguous wall-clock times deterministically', () => {
    // Spring-forward gap: 02:30 does not exist → shifted forward to 03:30 EDT.
    expect(
      zonedTimeToUtc(
        { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
        'America/New_York',
      ).toISOString(),
    ).toBe('2026-03-08T07:30:00.000Z');
    // Fall-back overlap: 01:30 happens twice → first occurrence (EDT).
    expect(
      zonedTimeToUtc(
        { year: 2026, month: 11, day: 1, hour: 1, minute: 30 },
        'America/New_York',
      ).toISOString(),
    ).toBe('2026-11-01T05:30:00.000Z');
    expect(
      zonedTimeToUtc({ year: 2026, month: 6, day: 1, hour: 9 }, 'Asia/Kolkata').toISOString(),
    ).toBe('2026-06-01T03:30:00.000Z');
  });

  it('formats the same instant per organization zone', () => {
    const instant = '2026-07-01T18:45:00Z';
    const opts = { hour: '2-digit', minute: '2-digit', hour12: false } as const;
    expect(formatInTimeZone(instant, 'Asia/Kolkata', opts, 'en-GB')).toBe('00:15');
    expect(formatInTimeZone(instant, 'America/New_York', opts, 'en-GB')).toBe('14:45');
    expect(formatInTimeZone(null, 'UTC')).toBe('');
    expect(formatInTimeZone('not a date', 'UTC')).toBe('');
  });
});
