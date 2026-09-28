import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn.js';

const control =
  'block w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg ' +
  'placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(control, 'h-9', className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'py-2', className)} {...props} />;
});

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
  /** Renders a first empty option with this label. */
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, options, placeholder, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, 'h-9 pr-8', className)} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  );
});

export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }
>(function Checkbox({ label, className, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="h-4 w-4 rounded border-border-strong accent-[var(--crm-primary)]"
        {...props}
      />
      <label htmlFor={inputId} className="text-sm text-fg">
        {label}
      </label>
    </div>
  );
});

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-sm font-medium text-fg', className)} {...props} />;
}

export interface FieldProps {
  label: string;
  /** The single form control. It receives id, aria-invalid and aria-describedby. */
  children: ReactElement<Record<string, unknown>>;
  error?: string | undefined;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, children, error, hint, required, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: (children.props.id as string | undefined) ?? id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
        'aria-required': required || undefined,
      })
    : children;
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={(children.props.id as string | undefined) ?? id}>
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        )}
      </Label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Responsive two-column grid for form fields. */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>{children}</div>;
}
