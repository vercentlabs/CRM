import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeProvider';

type GradientTextProps = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  /** expo-linear-gradient requires at least two colors. */
  colors?: readonly [string, string, ...string[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
};

const GradientText = ({
  children,
  style,
  colors,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 0 }
}: GradientTextProps) => {
  const { theme } = useTheme();
  const gradientColors: readonly [string, string, ...string[]] = colors ?? [theme.colors.brand, theme.colors.brandSoft];

  return (
    <MaskedView
      maskElement={
        <Text style={[style, { backgroundColor: 'transparent' }]}>{children}</Text>
      }
    >
      <LinearGradient colors={gradientColors} start={start} end={end}>
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
};

export default GradientText;
