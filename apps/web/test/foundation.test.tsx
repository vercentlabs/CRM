import { ApiClientError } from '@crm/api-client';
import { EmptyState } from '@crm/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from '@/components/data-table/DataTable';
import { ApiErrorState } from '@/components/feedback/QueryState';
import { applyServerErrors } from '@/components/forms/form';
import { toDisplayError } from '@/lib/errors';
import { toDateTimeInput, toIsoOrNull } from '@/lib/format';

const rows = [
  { id: 1, name: 'A' },
  { id: 2, name: 'B' },
];
const columns = [
  { id: 'name', header: 'Name', sortField: 'name', cell: (r: { name: string }) => r.name },
];
const pagination = { page: 1, limit: 2, total: 5, totalPages: 3 };

describe('DataTable', () => {
  it('toggles server sort and pages', () => {
    const onSortChange = vi.fn();
    const onPageChange = vi.fn();
    const { rerender } = render(
      <DataTable
        caption="Things"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={null}
        sort="name"
        onSortChange={onSortChange}
        pagination={pagination}
        onPageChange={onPageChange}
      />,
    );
    const header = screen.getByRole('columnheader', { name: /Name/ });
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSortChange).toHaveBeenCalledWith('-name');
    rerender(
      <DataTable
        caption="Things"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={null}
        sort="-name"
        onSortChange={onSortChange}
        pagination={pagination}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSortChange).toHaveBeenLastCalledWith('name');
    expect(screen.getByText('1–2 of 5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(
      (screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('renders loading skeletons, the empty state and errors', () => {
    const { rerender } = render(
      <DataTable
        caption="Things"
        columns={columns}
        rows={undefined}
        loading
        rowKey={(r: { id: number }) => r.id}
        empty={<EmptyState title="Nothing here" />}
      />,
    );
    expect(screen.queryByText('Nothing here')).toBeNull();
    rerender(
      <DataTable
        caption="Things"
        columns={columns}
        rows={[]}
        rowKey={(r: { id: number }) => r.id}
        empty={<EmptyState title="Nothing here" />}
      />,
    );
    expect(screen.getByText('Nothing here')).toBeTruthy();
    rerender(
      <DataTable
        caption="Things"
        columns={columns}
        rows={undefined}
        rowKey={(r: { id: number }) => r.id}
        empty={null}
        error={
          new ApiClientError({
            message: 'boom',
            status: 500,
            code: 'INTERNAL_ERROR',
            requestId: 'req-500',
          })
        }
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('req-500');
  });
});

describe('errors', () => {
  it('never shows server error text for 5xx, but keeps the request id', () => {
    const display = toDisplayError(
      new ApiClientError({
        message: 'relation "leads" does not exist',
        status: 500,
        code: 'INTERNAL_ERROR',
        requestId: 'r-1',
      }),
    );
    expect(display.message).not.toContain('relation');
    expect(display.requestId).toBe('r-1');
  });

  it('shows the API message for client errors and not-found semantics', () => {
    render(
      <ApiErrorState
        error={
          new ApiClientError({
            message: 'Lead not found',
            status: 404,
            code: 'NOT_FOUND',
            requestId: 'r-2',
          })
        }
        notFoundTitle="Lead not found"
      />,
    );
    expect(screen.getAllByText('Lead not found').length).toBeGreaterThan(0);
    render(
      <ApiErrorState
        error={new ApiClientError({ message: 'nope', status: 403, code: 'FORBIDDEN' })}
      />,
    );
    expect(screen.getByText("You don't have access to this")).toBeTruthy();
  });
});

describe('forms', () => {
  it('maps API validation details (with location prefixes) onto form fields', () => {
    const setError = vi.fn();
    const error = new ApiClientError({
      message: 'Validation failed',
      status: 400,
      code: 'VALIDATION_FAILED',
      details: [
        { field: 'body.email', message: 'Invalid email format' },
        { field: 'mobile_number', message: 'Must be 10 digits' },
      ],
    });
    const leftover = applyServerErrors(
      { setError, getValues: () => ({ email: '', mobile_number: '' }) } as never,
      error,
    );
    expect(leftover).toBeNull();
    expect(setError).toHaveBeenCalledWith('email', {
      type: 'server',
      message: 'Invalid email format',
    });
    expect(setError).toHaveBeenCalledWith('mobile_number', {
      type: 'server',
      message: 'Must be 10 digits',
    });
  });

  it('returns form-level messages for errors without a matching field', () => {
    const error = new ApiClientError({
      message: 'A customer with this email already exists',
      status: 409,
      code: 'CONFLICT',
    });
    expect(
      applyServerErrors({ setError: vi.fn(), getValues: () => ({ email: '' }) } as never, error),
    ).toBe('A customer with this email already exists');
  });

  it('sends date inputs (organization wall-clock time, UTC by default) as ISO instants', () => {
    const iso = toIsoOrNull('2026-10-01T09:30');
    expect(iso).toBe('2026-10-01T09:30:00.000Z');
    expect(toDateTimeInput(iso)).toBe('2026-10-01T09:30');
    expect(toIsoOrNull('')).toBeNull();
  });
});
