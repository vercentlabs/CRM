import { resolveTimeZone, zonedParts, zonedTimeToUtc } from '@crm/validation';

/**
 * Date/number presentation in the viewer's locale and the ACTIVE ORGANIZATION's
 * time zone (session `organization.timezone`, set by SessionProvider; UTC
 * until a session is loaded or when the setting is invalid). Date inputs are
 * read and written in the same zone, so what users type is what they see.
 */

type DateInput = string | Date | null | undefined;

let zone = 'UTC';
let formatters = build(zone);
function build(timeZone: string) {
  return {
    date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone }),
    dateTime: new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }),
    time: new Intl.DateTimeFormat(undefined, { timeStyle: 'short', timeZone }),
  };
}

/** Called when the session (or active organization) changes. */
export function setDisplayTimeZone(value: string | null | undefined): void {
  const next = resolveTimeZone(value);
  if (next === zone) return;
  zone = next;
  formatters = build(zone);
}

export const displayTimeZone = () => zone;

const relFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export const parseDate = (value: DateInput): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value: DateInput, empty = '—') => {
  const date = parseDate(value);
  return date ? formatters.date.format(date) : empty;
};

export const formatDateTime = (value: DateInput, empty = '—') => {
  const date = parseDate(value);
  return date ? formatters.dateTime.format(date) : empty;
};

export const formatTime = (value: DateInput, empty = '—') => {
  const date = parseDate(value);
  return date ? formatters.time.format(date) : empty;
};

/** "in 3 hours", "2 days ago"; older than a month falls back to a date. */
export function formatRelative(value: DateInput, now = Date.now(), empty = '—') {
  const date = parseDate(value);
  if (!date) return empty;
  const seconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relFmt.format(seconds, 'second');
  if (abs < 3600) return relFmt.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relFmt.format(Math.round(seconds / 3600), 'hour');
  if (abs < 2_592_000) return relFmt.format(Math.round(seconds / 86_400), 'day');
  return formatters.date.format(date);
}

export const isPast = (value: DateInput, now = Date.now()) => {
  const date = parseDate(value);
  return date ? date.getTime() < now : false;
};

export const isToday = (value: DateInput, now = new Date()) => {
  const date = parseDate(value);
  if (!date) return false;
  const a = zonedParts(date, zone);
  const b = zonedParts(now, zone);
  return a.year === b.year && a.month === b.month && a.day === b.day;
};

const numberFmt = new Intl.NumberFormat();
export const formatNumber = (value: number | string | null | undefined, empty = '—') =>
  value === null || value === undefined || value === '' ? empty : numberFmt.format(Number(value));

const amountFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
/** Opportunity values have no currency column; they are shown as plain amounts. */
export const formatAmount = (value: number | string | null | undefined, empty = '—') =>
  value === null || value === undefined || value === '' ? empty : amountFmt.format(Number(value));

export const formatDuration = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
};

const pad = (n: number) => n.toString().padStart(2, '0');

/** `<input type="datetime-local">` value for a timestamp, in the organization zone. */
export function toDateTimeInput(value: DateInput): string {
  const date = parseDate(value);
  if (!date) return '';
  const p = zonedParts(date, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** `<input type="date">` value. */
export const toDateInput = (value: DateInput) => toDateTimeInput(value).slice(0, 10);

/**
 * `datetime-local`/`date` input value (organization wall-clock time) → ISO
 * instant, so the server never guesses a time zone. DST gaps shift forward;
 * ambiguous times take the first occurrence. Empty or invalid → null.
 */
export function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!match) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const [, y, mo, d, h, mi] = match;
  const local = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h ?? 0),
    minute: Number(mi ?? 0),
  };
  const date = zonedTimeToUtc(local, zone);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
