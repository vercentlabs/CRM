/**
 * Mobile colour tokens. Same palette as the web design system
 * (packages/ui/theme.css) so both clients read as one product; text colours
 * meet WCAG AA on their surfaces in both modes.
 */
export type ThemeColors = {
  bg: string;
  surface: string;
  surfaceMuted: string;
  fg: string;
  muted: string;
  border: string;
  borderStrong: string;
  primary: string;
  primaryFg: string;
  primarySoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  overlay: string;
};

export const lightColors: ThemeColors = {
  bg: '#f6f7f9',
  surface: '#ffffff',
  surfaceMuted: '#f1f3f6',
  fg: '#111827',
  muted: '#5b6474',
  border: '#e1e5eb',
  borderStrong: '#c9d0da',
  primary: '#2f54d9',
  primaryFg: '#ffffff',
  primarySoft: '#e8edfd',
  danger: '#c62828',
  dangerSoft: '#fdecec',
  success: '#1b7a45',
  successSoft: '#e6f4ec',
  warning: '#9a5b00',
  warningSoft: '#fdf3e2',
  info: '#1f5fa8',
  infoSoft: '#e7f0fb',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

export const darkColors: ThemeColors = {
  bg: '#0e1116',
  surface: '#161a21',
  surfaceMuted: '#1d222b',
  fg: '#e6e9ef',
  muted: '#9aa3b2',
  border: '#2a303b',
  borderStrong: '#3a4250',
  primary: '#6b8cff',
  primaryFg: '#0b1020',
  primarySoft: '#1d2a52',
  danger: '#ff7b72',
  dangerSoft: '#3a1d1d',
  success: '#5cc98b',
  successSoft: '#173325',
  warning: '#f0b35a',
  warningSoft: '#3a2b12',
  info: '#79b0ff',
  infoSoft: '#172a45',
  overlay: 'rgba(0, 0, 0, 0.6)',
};
