import { describe, expect, it } from 'vitest';
import { fillSeries } from './series';

describe('fillSeries', () => {
  it('fills every weekday in Monday-first order', () => {
    const series = fillSeries('week', [{ time: 'Wed', leads: 3 }]);
    expect(series.map((p) => p.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(series.find((p) => p.label === 'Wed')?.value).toBe(3);
    expect(series.filter((p) => p.value === 0)).toHaveLength(6);
  });

  it('fills 24 hours for today and the ISO weeks of the month so far', () => {
    expect(fillSeries('today', [{ time: '9:00', leads: 2 }])).toHaveLength(24);
    const month = fillSeries('month', [{ time: 'Week 40', leads: 5 }], new Date(2026, 9, 7));
    expect(month.map((p) => p.label)).toEqual(['Week 40', 'Week 41']);
    expect(month[0]!.value).toBe(5);
  });
});
