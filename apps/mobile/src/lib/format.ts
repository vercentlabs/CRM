import { resolveTimeZone } from '@crm/validation';

/**
 * Date/number presentation in the device locale and the ACTIVE ORGANIZATION's
 * time zone (session `organization.timezone`, set by SessionProvider; UTC
 * until a session exists or when the setting is invalid). Screens never show
 * raw ISO strings. The calendar grid itself still groups by device-local day.
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
const numberFmt = new Intl.NumberFormat();

/** Called when the session (or active organization) changes. */
export function setDisplayTimeZone(value: string | null | undefined): void {
  const next = resolveTimeZone(value);
  if (next === zone) return;
  zone = next;
  formatters = build(zone);
}

export const displayTimeZone = () => zone;

export const parseDate = (value: DateInput): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value: DateInput, empty = '—') => {
  const d = parseDate(value);
  return d ? formatters.date.format(d) : empty;
};

export const formatDateTime = (value: DateInput, empty = '—') => {
  const d = parseDate(value);
  return d ? formatters.dateTime.format(d) : empty;
};

export const formatTime = (value: DateInput, empty = '—') => {
  const d = parseDate(value);
  return d ? formatters.time.format(d) : empty;
};

/** "in 3 hours", "2 days ago" (older than a month → date). */
export function formatRelative(value: DateInput, now = Date.now(), empty = '—'): string {
  const d = parseDate(value);
  if (!d) return empty;
  const seconds = Math.round((d.getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const phrase = (text: string) => (seconds >= 0 ? `in ${text}` : `${text} ago`);
  if (abs < 60) return 'just now';
  if (abs < 3600) return phrase(unit(Math.round(abs / 60), 'minute'));
  if (abs < 86_400) return phrase(unit(Math.round(abs / 3600), 'hour'));
  if (abs < 2_592_000) return phrase(unit(Math.round(abs / 86_400), 'day'));
  return formatters.date.format(d);
}

export const isPast = (value: DateInput, now = Date.now()) => {
  const d = parseDate(value);
  return d ? d.getTime() < now : false;
};

export const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export const formatNumber = (value: number | string | null | undefined, empty = '—') =>
  value === null || value === undefined || value === '' ? empty : numberFmt.format(Number(value));

export const formatDuration = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
};
