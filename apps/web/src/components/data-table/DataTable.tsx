'use client';

import type { PaginationMeta } from '@crm/types';
import { Pagination, Skeleton, Table, TBody, Td, Th, THead, Tr, cn } from '@crm/ui';
import type { ReactNode } from 'react';
import { ApiErrorState } from '@/components/feedback/QueryState';

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** API sort field (allowlisted server-side); makes the header sortable. */
  sortField?: string;
  className?: string;
  /** Hide on narrow screens (tables otherwise scroll horizontally). */
  hideBelow?: 'sm' | 'md' | 'lg';
}

const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

/**
 * The CRM list table: sortable headers (server sort, `field` / `-field`),
 * skeleton rows while loading, empty and error states, and pagination.
 * Rows are identified by `rowKey`; row actions are regular cells.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  sort,
  onSortChange,
  pagination,
  onPageChange,
  selectedKeys,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty: ReactNode;
  /** Current sort, e.g. `-created_at`. */
  sort?: string;
  onSortChange?: (sort: string) => void;
  pagination?: PaginationMeta | undefined;
  onPageChange?: (page: number) => void;
  selectedKeys?: ReadonlySet<string | number>;
}) {
  if (error && !loading) {
    return <ApiErrorState error={error} {...(onRetry ? { onRetry } : {})} />;
  }
  if (!loading && rows && rows.length === 0) return <>{empty}</>;

  const sortState = (field: string | undefined) => {
    if (!field || !sort) return null;
    if (sort === field) return 'asc' as const;
    if (sort === `-${field}`) return 'desc' as const;
    return null;
  };

  return (
    <div>
      <Table caption={caption}>
        <THead>
          <tr>
            {columns.map((column) => (
              <Th
                key={column.id}
                className={cn(column.className, column.hideBelow && hide[column.hideBelow])}
                {...(column.sortField && onSortChange
                  ? {
                      sort: sortState(column.sortField),
                      onSort: () =>
                        onSortChange(
                          sort === column.sortField ? `-${column.sortField}` : column.sortField!,
                        ),
                    }
                  : {})}
              >
                {column.header}
              </Th>
            ))}
          </tr>
        </THead>
        <TBody>
          {loading || !rows
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  {columns.map((column) => (
                    <Td key={column.id} className={cn(column.hideBelow && hide[column.hideBelow])}>
                      <Skeleton className="h-4 w-full max-w-40" />
                    </Td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <Tr key={rowKey(row)} selected={selectedKeys?.has(rowKey(row)) ?? false}>
                  {columns.map((column) => (
                    <Td
                      key={column.id}
                      className={cn(column.className, column.hideBelow && hide[column.hideBelow])}
                    >
                      {column.cell(row)}
                    </Td>
                  ))}
                </Tr>
              ))}
        </TBody>
      </Table>
      {pagination && onPageChange && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
