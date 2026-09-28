import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../../theme/ThemeProvider';
import { Text } from './Text';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  message?: string | undefined;
}

interface ToastApi {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** The single feedback surface; every toast is also announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const insets = useSafeAreaInsets();
  const c = useColors();

  const show = useCallback((tone: Tone, title: string, message?: string) => {
    const id = ++next.current;
    setToasts((current) => [...current.slice(-2), { id, tone, title, message }]);
    AccessibilityInfo.announceForAccessibility([title, message].filter(Boolean).join('. '));
    setTimeout(
      () => setToasts((current) => current.filter((t) => t.id !== id)),
      tone === 'error' ? 7000 : 3500,
    );
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, message) => show('success', title, message),
      error: (title, message) => show('error', title, message),
      info: (title, message) => show('info', title, message),
    }),
    [show],
  );

  const border: Record<Tone, string> = { success: c.success, error: c.danger, info: c.border };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View pointerEvents="box-none" style={[styles.stack, { bottom: insets.bottom + 16 }]}>
        {toasts.map((toast) => (
          <Pressable
            key={toast.id}
            onPress={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
            accessibilityRole="alert"
            accessibilityHint="Tap to dismiss"
            style={[styles.toast, { backgroundColor: c.surface, borderColor: border[toast.tone] }]}
          >
            <Text variant="label" color={toast.tone === 'error' ? 'danger' : 'fg'}>
              {toast.title}
            </Text>
            {toast.message ? (
              <Text variant="caption" color="muted">
                {toast.message}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

/** Native confirmation for destructive actions. */
export function confirm({
  title,
  message,
  confirmLabel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', left: 16, right: 16, gap: 8 },
  toast: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
