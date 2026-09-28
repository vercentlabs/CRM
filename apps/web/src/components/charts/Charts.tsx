'use client';

import { Button, Table, TBody, Td, Th, THead, cn } from '@crm/ui';
import { useId, useState, type ReactNode } from 'react';
import { formatNumber } from '@/lib/format';

/**
 * Minimal single-series charts (no chart library): one hue (the primary
 * token), thin marks with a rounded data end, values in text colors, hover
 * detail via native titles, and a table view for every chart.
 */

export interface Datum {
  label: string;
  value: number;
  /** Optional secondary line shown in the table and tooltip. */
  detail?: string;
}

function TableToggle({
  data,
  caption,
  valueLabel,
  children,
}: {
  data: Datum[];
  caption: string;
  valueLabel: string;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const regionId = useId();
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          aria-controls={regionId}
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
        >
          {asTable ? 'Show chart' : 'Show table'}
        </Button>
      </div>
      <div id={regionId}>
        {asTable ? (
          <Table caption={caption}>
            <THead>
              <tr>
                <Th>Category</Th>
                <Th className="text-right">{valueLabel}</Th>
              </tr>
            </THead>
            <TBody>
              {data.map((d) => (
                <tr key={d.label}>
                  <Td>
                    {d.label}
                    {d.detail && <span className="block text-xs text-muted">{d.detail}</span>}
                  </Td>
                  <Td className="text-right tabular-nums">{formatNumber(d.value)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** Horizontal bars for categories (statuses, age buckets, members). */
export function BarList({
  data,
  caption,
  valueLabel = 'Count',
  format = formatNumber,
}: {
  data: Datum[];
  caption: string;
  valueLabel?: string;
  format?: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <TableToggle data={data} caption={caption} valueLabel={valueLabel}>
      <ul aria-label={caption} className="space-y-2.5">
        {data.map((d) => (
          <li
            key={d.label}
            className="grid grid-cols-[minmax(6rem,10rem)_1fr] items-center gap-3 text-sm"
            title={`${d.label}: ${format(d.value)}${d.detail ? ` · ${d.detail}` : ''}`}
          >
            <span className="truncate text-muted">{d.label}</span>
            <span className="flex items-center gap-2">
              <span className="h-3.5 flex-1 overflow-visible">
                <span
                  aria-hidden
                  className="block h-3.5 rounded-r bg-primary"
                  style={{ width: `${d.value === 0 ? 0 : Math.max(1.5, (d.value / max) * 100)}%` }}
                />
              </span>
              <span className="w-14 shrink-0 text-right font-medium tabular-nums">
                {format(d.value)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </TableToggle>
  );
}

/** Vertical columns for an ordered series (e.g. leads per hour/day/week). */
export function ColumnChart({
  data,
  caption,
  valueLabel = 'Leads',
}: {
  data: Datum[];
  caption: string;
  valueLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.reduce<Datum | null>(
    (best, d) => (!best || d.value > best.value ? d : best),
    null,
  );
  return (
    <TableToggle data={data} caption={caption} valueLabel={valueLabel}>
      <figure aria-label={caption}>
        <div
          className="relative flex h-40 items-end gap-[2px] border-b border-border"
          role="img"
          aria-label={`${caption}. Highest: ${peak?.label ?? '—'} with ${peak?.value ?? 0}.`}
        >
          {data.map((d) => (
            <div
              key={d.label}
              className="group relative flex h-full flex-1 items-end justify-center"
              title={`${d.label}: ${formatNumber(d.value)}`}
            >
              <span
                className={cn(
                  'w-full max-w-6 rounded-t bg-primary transition-opacity group-hover:opacity-80',
                  d.value === 0 && 'bg-transparent',
                )}
                style={{ height: `${(d.value / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-[2px] text-[10px] text-muted" aria-hidden>
          {data.map((d, i) => (
            <span key={d.label} className="flex-1 truncate text-center">
              {data.length > 12 && i % Math.ceil(data.length / 8) !== 0 ? '' : d.label}
            </span>
          ))}
        </div>
      </figure>
    </TableToggle>
  );
}
