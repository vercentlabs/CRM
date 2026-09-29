/**
 * Organization time zone helpers shared by API, web, mobile and worker.
 * Uses only the platform's Intl (IANA database); no timezone library.
 * An invalid or missing zone always falls back to UTC — never throws at
 * display time.
 */

export const DEFAULT_TIME_ZONE = 'UTC';

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Settings values are stored JSON-encoded; older rows may be raw strings. */
export function resolveTimeZone(value: unknown, fallback = DEFAULT_TIME_ZONE): string {
  let candidate = value;
  if (typeof candidate === 'string') {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (typeof parsed === 'string') candidate = parsed;
    } catch {
      // raw string
    }
    candidate = (candidate as string).trim();
  }
  return isValidTimeZone(candidate) ? candidate : fallback;
}

type DateInput = Date | string | number;
const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(value: DateInput, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimeZone(timeZone),
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(toDate(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset of the zone from UTC at that instant, in minutes (Asia/Kolkata → 330). */
export function timeZoneOffsetMinutes(value: DateInput, timeZone: string): number {
  const date = toDate(value);
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant at which a wall-clock time occurs in the zone. Nonexistent
 * times (spring-forward gap) move forward by the gap; ambiguous times
 * (fall-back) resolve to the first occurrence.
 */
export function zonedTimeToUtc(
  local: { year: number; month: number; day: number; hour?: number; minute?: number },
  timeZone: string,
): Date {
  const guess = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour ?? 0,
    local.minute ?? 0,
  );
  const first = guess - timeZoneOffsetMinutes(guess, timeZone) * 60_000;
  const second = guess - timeZoneOffsetMinutes(first, timeZone) * 60_000;
  const wall = (instant: number) => {
    const p = zonedParts(instant, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) === guess;
  };
  const exact = [first, second].filter(wall);
  // Overlap: earliest exact match. Gap: no exact match → the later candidate (shifted forward).
  return new Date(exact.length > 0 ? Math.min(...exact) : Math.max(first, second));
}

/** Midnight at the start of the zone's calendar day containing `value`. */
export function startOfDayInTimeZone(value: DateInput, timeZone: string): Date {
  const p = zonedParts(value, timeZone);
  return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day }, timeZone);
}

/** Locale formatting in the organization's zone (falls back to UTC). */
export function formatInTimeZone(
  value: DateInput | null | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
  locale?: string,
): string {
  if (value === null || value === undefined || value === '') return '';
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: resolveTimeZone(timeZone),
  }).format(date);
}
