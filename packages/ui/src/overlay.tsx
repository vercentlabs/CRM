import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './button.js';
import { cn } from './cn.js';
import { XIcon } from './icons.js';

interface DialogBaseProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Prevents closing with Escape / backdrop while an operation is running. */
  busy?: boolean;
}

/**
 * Modal built on the native <dialog>: top layer, inert background and Escape
 * come from the browser; focus returns to the opener on close or unmount.
 */
function ModalShell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  busy,
  variant,
}: DialogBaseProps & { variant: 'dialog' | 'sheet' }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    // Return focus to the opener however the dialog goes away (closed or unmounted).
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    return () => {
      if (dialog.open) {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
      }
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        // Clicks on the backdrop target the <dialog> element itself.
        if (event.target === ref.current && !busy) onClose();
      }}
      className={cn(
        'bg-surface text-fg shadow-xl open:flex flex-col p-0 m-0 max-w-none max-h-none',
        variant === 'dialog'
          ? 'rounded-lg border border-border w-[calc(100%-2rem)] max-w-lg max-h-[85vh] m-auto'
          : 'ml-auto h-full w-full max-w-xl border-l border-border',
        className,
      )}
    >
      {open && (
        <>
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
              className="rounded p-1 text-muted hover:bg-surface-muted hover:text-fg"
            >
              <XIcon />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
              {footer}
            </footer>
          )}
        </>
      )}
    </dialog>
  );
}

export function Dialog(props: DialogBaseProps) {
  return <ModalShell {...props} variant="dialog" />;
}

/** Side panel for create/edit forms and record details. */
export function Sheet(props: DialogBaseProps) {
  return <ModalShell {...props} variant="sheet" />;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      busy={loading}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className="text-sm text-muted">{description}</div>}
    </Dialog>
  );
}
