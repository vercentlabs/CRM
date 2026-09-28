import { darkColors, lightColors, type ThemeColors } from './colors';
import { spacing, type SpacingScale } from './spacing';
import { typography, type TypographyScale } from './typography';

export type ThemeMode = 'light' | 'dark';

export type Theme = {
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: SpacingScale;
  typography: TypographyScale;
};

export const lightTheme: Theme = {
  mode: 'light',
  colors: lightColors,
  spacing,
  typography
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: darkColors,
  spacing,
  typography
};

