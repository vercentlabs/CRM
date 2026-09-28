import { StyleSheet, View } from 'react-native';
import { useColors } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/colors';
import { Text } from './Text';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const toneColors = (c: ThemeColors): Record<Tone, { bg: string; fg: string }> => ({
  neutral: { bg: c.surfaceMuted, fg: c.muted },
  primary: { bg: c.primarySoft, fg: c.primary },
  success: { bg: c.successSoft, fg: c.success },
  warning: { bg: c.warningSoft, fg: c.warning },
  danger: { bg: c.dangerSoft, fg: c.danger },
  info: { bg: c.infoSoft, fg: c.info },
});

/** A label chip. Meaning is always carried by its text, never by colour alone. */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const colors = toneColors(useColors())[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text variant="caption" style={{ color: colors.fg, fontWeight: '600', fontSize: 12 }}>
        {label}
      </Text>
    </View>
  );
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')
  ).toUpperCase();
}

export function Avatar({ name, size = 36 }: { name: string | null | undefined; size?: number }) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={name ?? 'Unknown'}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: c.primarySoft },
      ]}
    >
      <Text style={{ color: c.primary, fontWeight: '700', fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
});
