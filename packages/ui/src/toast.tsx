import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from './cn.js';
import { XIcon } from './icons.js';

export type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string | undefined;
}

interface ToastApi {
  show: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const tones: Record<ToastTone, string> = {
  success: 'border-success/40',
  error: 'border-danger/50',
  info: 'border-border',
};

/** The single notification surface. Errors are announced assertively, others politely. */
export function ToastProvider({
  children,
  duration = 4500,
}: {
  children: ReactNode;
  duration?: number;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = ++next.current;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      setTimeout(() => dismiss(id), toast.tone === 'error' ? duration * 2 : duration);
    },
    [dismiss, duration],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => show({ tone: 'success', title, description }),
      error: (title, description) => show({ tone: 'error', title, description }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        <div role="status" aria-live="polite" className="contents">
          {toasts
            .filter((t) => t.tone !== 'error')
            .map((toast) => (
              <ToastView key={toast.id} toast={toast} onDismiss={dismiss} />
            ))}
        </div>
        <div role="alert" aria-live="assertive" className="contents">
          {toasts
            .filter((t) => t.tone === 'error')
            .map((toast) => (
              <ToastView key={toast.id} toast={toast} onDismiss={dismiss} />
            ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-md border bg-surface px-3 py-2.5 text-sm shadow-lg',
        tones[toast.tone],
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium', toast.tone === 'error' && 'text-danger')}>{toast.title}</p>
        {toast.description && <p className="mt-0.5 break-words text-muted">{toast.description}</p>}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="rounded p-0.5 text-muted hover:text-fg"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
