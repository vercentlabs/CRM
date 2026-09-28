import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropdownMenu, ErrorState, Field, Input, Tabs, Th } from './index.js';

afterEach(cleanup);

describe('Field', () => {
  it('links the label, hint and error to the control', () => {
    render(
      <Field label="Email" required error="Invalid email format">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText(/Email/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-required')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe('Invalid email format');
  });
});

describe('DropdownMenu', () => {
  it('opens from the keyboard, moves with arrows and closes with Escape', () => {
    const onEdit = vi.fn();
    render(
      <DropdownMenu
        label="Row actions"
        trigger="Actions"
        items={[
          { label: 'Edit', onSelect: onEdit },
          { label: 'Delete', onSelect: () => undefined, tone: 'danger' },
        ]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Row actions' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu');
    expect(document.activeElement?.textContent).toBe('Edit');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Delete');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('Tabs', () => {
  it('uses roving focus with arrow keys', () => {
    const onChange = vi.fn();
    render(
      <Tabs
        label="Settings"
        value="a"
        onChange={onChange}
        tabs={[
          { id: 'a', label: 'Organization', content: 'Org' },
          { id: 'b', label: 'Account', content: 'Me' },
        ]}
      />,
    );
    act(() => {
      fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    });
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('tabpanel').textContent).toBe('Org');
  });
});

describe('Th', () => {
  it('exposes sort state', () => {
    render(
      <table>
        <thead>
          <tr>
            <Th sort="desc" onSort={() => undefined}>
              Created
            </Th>
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('descending');
  });
});

describe('ErrorState', () => {
  it('shows the request id for support', () => {
    render(<ErrorState description="Could not load leads" requestId="req-42" />);
    expect(screen.getByRole('alert').textContent).toContain('req-42');
  });
});
