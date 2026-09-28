'use client';

import { Dialog, SearchIcon, cn } from '@crm/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useSession } from '@/providers/SessionProvider';
import type { NavGroup } from './navigation';

interface Command {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

/**
 * Quick navigation (Ctrl/Cmd+K): the permission-filtered navigation plus
 * "search leads for …". It only navigates; it does not fetch anything itself.
 */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: NavGroup[];
}) {
  const router = useRouter();
  const { can } = useSession();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenChange]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      onOpenChange(false);
      setText('');
      router.push(href);
    };
    const query = text.trim().toLowerCase();
    const pages = groups
      .flatMap((group) => group.items.map((item) => ({ item, group: group.label })))
      .filter(
        ({ item }) =>
          !query || `${item.label} ${item.keywords ?? ''}`.toLowerCase().includes(query),
      )
      .map(({ item, group }) => ({
        id: item.href,
        label: item.label,
        hint: group,
        run: go(item.href),
      }));
    const search =
      query && can('crm.leads.read')
        ? [
            {
              id: 'search-leads',
              label: `Search leads for “${text.trim()}”`,
              hint: 'Leads',
              run: go(`/leads?search=${encodeURIComponent(text.trim())}`),
            },
          ]
        : [];
    return [...pages, ...search];
  }, [groups, text, can, router, onOpenChange]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') setActive((i) => Math.min(i + 1, commands.length - 1));
    else if (event.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
    else if (event.key === 'Enter') commands[active]?.run();
    else return;
    event.preventDefault();
  };

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} title="Quick navigation">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={commands[active] ? `${listId}-${commands[active].id}` : undefined}
          aria-label="Page or lead search"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Type a page name or a lead to search…"
          className="h-10 w-full rounded-md border border-border-strong bg-surface pr-3 pl-9 text-sm"
        />
      </div>
      <ul id={listId} role="listbox" aria-label="Results" className="mt-3 max-h-80 overflow-y-auto">
        {commands.length === 0 && (
          <li className="px-2 py-3 text-sm text-muted">No matching pages</li>
        )}
        {commands.map((command, index) => (
          <li
            key={command.id}
            id={`${listId}-${command.id}`}
            role="option"
            aria-selected={index === active}
            onMouseDown={(event) => {
              event.preventDefault();
              command.run();
            }}
            onMouseEnter={() => setActive(index)}
            className={cn(
              'flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-sm',
              index === active && 'bg-surface-muted',
            )}
          >
            <span>{command.label}</span>
            <span className="text-xs text-muted">{command.hint}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
