/**
 * Date/number presentation in the device locale and time zone (the
 * organization time-zone setting is a known gap shared with the web app).
 * Screens never show raw ISO strings.
 */
type DateInput = string | Date | null | undefined;

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const numberFmt = new Intl.NumberFormat();

export const parseDate = (value: DateInput): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value: DateInput, empty = '—') => {
  const d = parseDate(value);
  return d ? dateFmt.format(d) : empty;
};

export const formatDateTime = (value: DateInput, empty = '—') => {
  const d = parseDate(value);
  return d ? dateTimeFmt.format(d) : empty;
};

export const formatTime = (value: DateInput, empty = '—') => {
  const d = parseDate(value);
  return d ? timeFmt.format(d) : empty;
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
  return dateFmt.format(d);
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
