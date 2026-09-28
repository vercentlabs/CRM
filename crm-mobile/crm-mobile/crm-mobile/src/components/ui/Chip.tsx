import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

type ChipProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: object;
  textStyle?: object;
};

const Chip = ({ label, active = false, onPress, style, textStyle }: ChipProps) => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        active
          ? { backgroundColor: colors.brandMuted, borderColor: colors.brand }
          : { borderColor: colors.border },
        pressed ? styles.pressed : null,
        style
      ]}
    >
      <Text
        style={[
          styles.text,
          active ? { color: colors.brandSoft } : { color: colors.mutedForeground },
          textStyle
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

export default Chip;

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8
  },
  pressed: {
    opacity: 0.85
  },
  text: {
    fontSize: 11,
    fontWeight: '600'
  }
});
