import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { toDisplayError } from '../../lib/errors';
import { useColors } from '../../theme/ThemeProvider';
import { Button, type IconName } from './Button';
import { Text } from './Text';

function Panel({
  icon,
  title,
  message,
  action,
  footer,
  alert,
}: {
  icon: IconName;
  title: string;
  message?: string | undefined;
  action?: ReactNode;
  footer?: ReactNode;
  alert?: boolean;
}) {
  const c = useColors();
  return (
    <View style={styles.panel} accessibilityRole={alert ? 'alert' : undefined} accessible={!action}>
      <Feather name={icon} size={28} color={c.muted} />
      <Text variant="heading" style={styles.center}>
        {title}
      </Text>
      {message ? (
        <Text color="muted" style={styles.center}>
          {message}
        </Text>
      ) : null}
      {action}
      {footer}
    </View>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const c = useColors();
  return (
    <View style={styles.panel} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={c.primary} />
      <Text color="muted">{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
  icon = 'inbox',
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  icon?: IconName;
}) {
  return <Panel icon={icon} title={title} message={message} action={action} />;
}

export function PermissionDenied({
  message = 'Your role in this organization does not include this. Ask an administrator if you need access.',
}: {
  message?: string;
}) {
  return <Panel icon="lock" title="You don't have access to this" message={message} alert />;
}

/** Standard error panel for a failed request: network, 403, 404 or server, with retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const display = toDisplayError(error);
  if (display.kind === 'forbidden') return <PermissionDenied />;
  return (
    <Panel
      icon={
        display.kind === 'network'
          ? 'wifi-off'
          : display.kind === 'not-found'
            ? 'search'
            : 'alert-triangle'
      }
      title={display.title}
      message={display.message}
      alert
      action={
        onRetry && display.kind !== 'not-found' ? (
          <Button label="Try again" icon="refresh-cw" onPress={onRetry} />
        ) : null
      }
      footer={
        display.requestId ? (
          <Text variant="caption" color="muted" selectable>
            Reference: {display.requestId}
          </Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  panel: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  center: { textAlign: 'center' },
});
