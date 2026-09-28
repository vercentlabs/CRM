import { Feather } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useColors } from '../../theme/ThemeProvider';
import { Text } from './Text';

export type IconName = ComponentProps<typeof Feather>['name'];
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Button with a 44pt minimum touch target, pending state (disabled + spinner,
 * which also prevents duplicate submits) and an accessibility role/state.
 */
export function Button({
  label,
  onPress,
  variant = 'secondary',
  icon,
  loading = false,
  disabled = false,
  style,
  accessibilityHint,
  testID,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}) {
  const c = useColors();
  const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.primary, fg: c.primaryFg, border: c.primary },
    secondary: { bg: c.surface, fg: c.fg, border: c.borderStrong },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    danger: { bg: c.danger, fg: '#ffffff', border: c.danger },
  };
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={p.fg} />
        ) : icon ? (
          <Feather name={icon} size={18} color={p.fg} />
        ) : null}
        <Text variant="label" style={{ color: p.fg, fontWeight: '600' }} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** Icon-only button: the label is required because there is no visible text. */
export function IconButton({
  icon,
  label,
  onPress,
  color,
  disabled,
  badge,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  color?: string;
  disabled?: boolean;
  badge?: ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      <Feather name={icon} size={22} color={color ?? c.fg} />
      {badge}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
