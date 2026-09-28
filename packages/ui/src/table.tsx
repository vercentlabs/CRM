import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { Button } from './button.js';
import { cn } from './cn.js';
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from './icons.js';

/** Horizontally scrollable table container; keeps dense tables readable on small screens. */
export function Table({
  children,
  caption,
  className,
}: {
  children: ReactNode;
  /** Visually hidden caption naming the table for screen readers. */
  caption: string;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto rounded-lg border border-border bg-surface', className)}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-surface-muted text-left text-xs font-medium text-muted">{children}</thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function Tr({
  children,
  className,
  selected,
}: {
  children: ReactNode;
  className?: string;
  selected?: boolean;
}) {
  return (
    <tr className={cn('hover:bg-surface-muted/60', selected && 'bg-primary-soft/40', className)}>
      {children}
    </tr>
  );
}

export type SortDirection = 'asc' | 'desc';

export function Th({
  children,
  className,
  sort,
  onSort,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & {
  /** Current sort of this column, or null when sortable but unsorted. */
  sort?: SortDirection | null;
  onSort?: () => void;
}) {
  const sortable = onSort !== undefined;
  return (
    <th
      scope="col"
      aria-sort={
        sort === 'asc'
          ? 'ascending'
          : sort === 'desc'
            ? 'descending'
            : sortable
              ? 'none'
              : undefined
      }
      className={cn('px-3 py-2 font-medium whitespace-nowrap', className)}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className="inline-flex items-center gap-1 hover:text-fg"
        >
          {children}
          {sort === 'asc' && <ArrowUpIcon className="h-3 w-3" />}
          {sort === 'desc' && <ArrowDownIcon className="h-3 w-3" />}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2 align-middle', className)} {...props} />;
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 py-3 text-sm text-muted"
    >
      <p aria-live="polite">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeftIcon />
        </Button>
        <span>
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </nav>
  );
}
