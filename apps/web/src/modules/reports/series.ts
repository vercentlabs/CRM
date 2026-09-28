import type { LeadsOverTimePoint, ReportPeriod } from '@crm/types';

/**
 * The API returns only buckets that have leads. A time axis needs every
 * bucket, so missing ones are filled with 0, in chronological order:
 * today → hours 0–23, week → Mon–Sun (weeks start on Monday), month → the
 * ISO weeks from the 1st of the month to today.
 */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function fillSeries(
  period: ReportPeriod,
  points: LeadsOverTimePoint[],
  now = new Date(),
): Array<{ label: string; value: number }> {
  const counts = new Map(points.map((p) => [p.time, p.leads]));
  let labels: string[];
  if (period === 'today') {
    labels = Array.from({ length: 24 }, (_, h) => `${h}:00`);
  } else if (period === 'week') {
    labels = WEEKDAYS;
  } else {
    const first = isoWeek(new Date(now.getFullYear(), now.getMonth(), 1));
    const last = isoWeek(now);
    // Around New Year the first ISO week of the month can be 52/53.
    labels =
      first <= last
        ? Array.from({ length: last - first + 1 }, (_, i) => `Week ${first + i}`)
        : [`Week ${first}`, ...Array.from({ length: last }, (_, i) => `Week ${i + 1}`)];
  }
  const known = new Set(labels);
  const extra = points.filter((p) => !known.has(p.time)).map((p) => p.time);
  return [...labels, ...extra].map((label) => ({ label, value: counts.get(label) ?? 0 }));
}
