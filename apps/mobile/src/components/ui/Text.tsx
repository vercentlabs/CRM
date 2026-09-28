import { Text as RNText, type TextProps } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption';
type Color = 'fg' | 'muted' | 'primary' | 'danger' | 'success' | 'warning';

const sizes = {
  title: { fontSize: 24, fontWeight: '700' },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 14, fontWeight: '500' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const;

/** Themed text. Font sizes scale with the OS text-size setting (allowFontScaling). */
export function Text({
  variant = 'body',
  color = 'fg',
  style,
  ...props
}: TextProps & { variant?: Variant; color?: Color }) {
  const { colors } = useTheme().theme;
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...props}
      style={[sizes[variant], { color: colors[color] }, style]}
    />
  );
}
