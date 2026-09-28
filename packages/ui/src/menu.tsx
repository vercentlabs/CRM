import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn.js';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

/**
 * Menu button (WAI-ARIA menu pattern): Enter/Space/ArrowDown open it,
 * arrows move, Escape closes and returns focus to the trigger.
 */
export function DropdownMenu({
  trigger,
  label,
  items,
  align = 'end',
  header,
}: {
  /** Visible content of the trigger button. */
  trigger: ReactNode;
  /** Accessible name of the trigger. */
  label: string;
  items: MenuItem[];
  align?: 'start' | 'end';
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.map((item, index) => (item.disabled ? -1 : index)).filter((i) => i >= 0);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const openMenu = (index = enabled[0] ?? 0) => {
    setActive(index);
    setOpen(true);
  };

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const move = (delta: number) => {
    if (enabled.length === 0) return;
    const position = enabled.indexOf(active);
    const next = enabled[(position + delta + enabled.length) % enabled.length] ?? 0;
    setActive(next);
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') move(1);
    else if (event.key === 'ArrowUp') move(-1);
    else if (event.key === 'Home') setActive(enabled[0] ?? 0);
    else if (event.key === 'End') setActive(enabled[enabled.length - 1] ?? 0);
    else if (event.key === 'Escape') close();
    else if (event.key === 'Tab') close(false);
    else return;
    event.preventDefault();
  };

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openMenu(event.key === 'ArrowUp' ? enabled[enabled.length - 1] : enabled[0]);
          }
        }}
        className="inline-flex min-h-8 min-w-8 items-center justify-center gap-2 rounded-md text-muted hover:bg-surface-muted hover:text-fg aria-expanded:bg-surface-muted"
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            'absolute z-30 mt-1 min-w-48 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {header && <div className="border-b border-border px-3 py-2 text-sm">{header}</div>}
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={index === active ? 0 : -1}
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-muted focus:bg-surface-muted focus:outline-none disabled:opacity-50',
                item.tone === 'danger' ? 'text-danger' : 'text-fg',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
