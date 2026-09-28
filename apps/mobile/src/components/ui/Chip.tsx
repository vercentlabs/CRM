import { Pressable, StyleSheet } from 'react-native';
import { useColors } from '../../theme/ThemeProvider';
import { Text } from './Text';

/** Filter chip (toggle). Selection is conveyed by state and weight, not colour alone. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Filter: ${label}`}
      style={[
        styles.chip,
        {
          borderColor: selected ? c.primary : c.borderStrong,
          backgroundColor: selected ? c.primarySoft : c.surface,
        },
      ]}
    >
      <Text
        variant="label"
        style={{ color: selected ? c.primary : c.fg, fontWeight: selected ? '700' : '500' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
