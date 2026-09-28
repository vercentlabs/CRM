import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn.js';
import { Spinner } from './feedback.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover border-transparent',
  secondary: 'bg-surface text-fg border-border-strong hover:bg-surface-muted',
  ghost: 'bg-transparent text-fg border-transparent hover:bg-surface-muted',
  danger: 'bg-danger text-white border-transparent hover:opacity-90',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

export const buttonClass = (variant: ButtonVariant = 'secondary', size: ButtonSize = 'md') =>
  cn(
    'inline-flex shrink-0 items-center justify-center rounded-md border font-medium whitespace-nowrap',
    'transition-colors disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
  );

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    className,
    children,
    disabled,
    type,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(buttonClass(variant, size), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required accessible name: icon-only buttons have no visible text. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', className, children, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(buttonClass(variant, size), size === 'sm' ? 'w-8 px-0' : 'w-9 px-0', className)}
      {...props}
    >
      {children}
    </button>
  );
});
