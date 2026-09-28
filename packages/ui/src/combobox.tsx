import { useId, useState, type KeyboardEvent } from 'react';
import { cn } from './cn.js';
import { Spinner } from './feedback.js';

export interface ComboboxOption {
  value: number;
  label: string;
  description?: string | undefined;
}

/**
 * Searchable single-select (WAI-ARIA combobox with listbox popup). The
 * caller owns searching: `onSearch` receives the typed text and `options`
 * are the current results (typically from a debounced API query).
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  onSearch,
  loading = false,
  placeholder = 'Search…',
  emptyText = 'No matches',
  disabled,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  id?: string;
  options: ComboboxOption[];
  /** The selected option (kept by the caller so its label survives new searches). */
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption | null) => void;
  onSearch: (text: string) => void;
  loading?: boolean;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);

  const choose = (option: ComboboxOption) => {
    onChange(option);
    setText('');
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && open) {
      const option = options[active];
      if (option) choose(option);
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else return;
    event.preventDefault();
  };

  const activeId = open && options[active] ? `${listId}-${options[active].value}` : undefined;

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        autoComplete="off"
        value={open ? text : (value?.label ?? '')}
        placeholder={value ? value.label : placeholder}
        onFocus={() => {
          setOpen(true);
          onSearch(text);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
          setOpen(true);
          onSearch(event.target.value);
        }}
        onKeyDown={onKeyDown}
        className="block h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-muted aria-[invalid=true]:border-danger"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {loading && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted">
              <Spinner size="sm" /> Searching…
            </li>
          )}
          {!loading && options.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">{emptyText}</li>
          )}
          {!loading &&
            options.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${option.value}`}
                role="option"
                aria-selected={value?.value === option.value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'cursor-pointer px-3 py-1.5 text-sm',
                  index === active && 'bg-surface-muted',
                )}
              >
                <span className="block text-fg">{option.label}</span>
                {option.description && (
                  <span className="block text-xs text-muted">{option.description}</span>
                )}
              </li>
            ))}
        </ul>
      )}
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-1 text-xs text-muted hover:text-fg"
          aria-label={`Clear ${value.label}`}
        >
          Clear
        </button>
      )}
    </div>
  );
}
