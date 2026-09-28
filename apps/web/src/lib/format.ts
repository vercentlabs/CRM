/**
 * Date/number presentation in the viewer's locale and time zone. Organization
 * time-zone settings are not applied yet (only administrators can read
 * settings); see docs/architecture/WEB.md.
 */

type DateInput = string | Date | null | undefined;

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const relFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export const parseDate = (value: DateInput): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value: DateInput, empty = '—') => {
  const date = parseDate(value);
  return date ? dateFmt.format(date) : empty;
};

export const formatDateTime = (value: DateInput, empty = '—') => {
  const date = parseDate(value);
  return date ? dateTimeFmt.format(date) : empty;
};

export const formatTime = (value: DateInput, empty = '—') => {
  const date = parseDate(value);
  return date ? timeFmt.format(date) : empty;
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
  return dateFmt.format(date);
}

export const isPast = (value: DateInput, now = Date.now()) => {
  const date = parseDate(value);
  return date ? date.getTime() < now : false;
};

export const isToday = (value: DateInput, now = new Date()) => {
  const date = parseDate(value);
  return date ? date.toDateString() === now.toDateString() : false;
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

/** `<input type="datetime-local">` value for a timestamp, in local time. */
export function toDateTimeInput(value: DateInput): string {
  const date = parseDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `<input type="date">` value. */
export const toDateInput = (value: DateInput) => toDateTimeInput(value).slice(0, 10);

/**
 * Local `datetime-local`/`date` input value → ISO instant, so the server never
 * guesses the browser's time zone. Empty → null.
 */
export function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
