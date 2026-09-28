import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = {
  label?: string;
  children?: React.ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: object;
  textStyle?: object;
};

const Button = ({
  label,
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle
}: ButtonProps) => {
  const { theme, resolvedMode } = useTheme();
  const { colors } = theme;
  const primaryBackground =
    resolvedMode === 'light'
      ? colors.primary || colors.brand || '#000000'
      : colors.brand || colors.primary || '#6366f1';
  const primaryForeground = colors.primaryForeground || '#ffffff';
  const stylesByVariant = {
    primary: {
      backgroundColor: primaryBackground,
      borderWidth: 1,
      borderColor: primaryBackground
    },
    secondary: {
      backgroundColor: colors.appShell,
      borderWidth: 1,
      borderColor: colors.border
    },
    ghost: {
      backgroundColor: 'transparent'
    },
    danger: {
      backgroundColor: colors.destructive
    }
  } as const;

  const textByVariant = {
    primary: { color: primaryForeground },
    secondary: { color: colors.foreground },
    ghost: { color: colors.foreground },
    danger: { color: colors.primaryForeground }
  } as const;

  const content = label ?? null;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        stylesBySize[size],
        stylesByVariant[variant],
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            color={variant === 'secondary' ? colors.foreground : colors.primaryForeground}
          />
        ) : (
          icon
        )}
        {content ? (
          <Text style={[styles.textBase, textByVariant[variant], textStyle]}>{content}</Text>
        ) : (
          children
        )}
      </View>
    </Pressable>
  );
};

export default Button;

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row'
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  textBase: {
    fontSize: 12,
    fontWeight: '600'
  },
  pressed: {
    opacity: 0.85
  },
  disabled: {
    opacity: 0.6
  }
});

const stylesBySize: Record<ButtonSize, object> = {
  sm: { height: 32, paddingHorizontal: 12 },
  md: { height: 40, paddingHorizontal: 16 },
  lg: { height: 48, paddingHorizontal: 18 }
};
