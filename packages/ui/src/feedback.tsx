import type { ReactNode } from 'react';
import { cn } from './cn.js';

export function Spinner({ size = 'md', label }: { size?: 'sm' | 'md'; label?: string }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5',
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded bg-surface-muted', className)} />;
}

/** Placeholder for a page while its first request is in flight. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

interface StateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

function StatePanel({
  title,
  description,
  action,
  icon,
  className,
  role,
}: StateProps & { role?: 'alert' | 'status' }) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-10 text-center',
        className,
      )}
    >
      {icon && (
        <div aria-hidden className="mb-3 text-muted">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description && <div className="mt-1 max-w-md text-sm text-muted">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function EmptyState(props: StateProps) {
  return <StatePanel {...props} />;
}

export function ErrorState({
  title = 'Something went wrong',
  requestId,
  ...props
}: Partial<StateProps> & { requestId?: string | undefined }) {
  return (
    <StatePanel
      role="alert"
      title={title}
      {...props}
      description={
        <>
          {props.description}
          {requestId && (
            <span className="mt-2 block text-xs">
              Reference: <code className="font-mono select-all">{requestId}</code>
            </span>
          )}
        </>
      }
    />
  );
}

export function PermissionDenied({
  description = 'Your role in this organization does not include access to this page. Ask an administrator if you need it.',
}: {
  description?: ReactNode;
}) {
  return (
    <StatePanel role="alert" title="You don't have access to this" description={description} />
  );
}

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const alertTones: Record<AlertTone, string> = {
  info: 'bg-info-soft text-info border-info/30',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
};

/** Inline message (form errors, notices). Danger alerts are announced. */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-md border px-3 py-2 text-sm', alertTones[tone], className)}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? 'mt-0.5' : undefined}>{children}</div>}
    </div>
  );
}
