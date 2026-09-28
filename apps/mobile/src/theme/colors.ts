export type ThemeColors = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  border: string;
  inputBg: string;
  inputBorder: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  warning: string;
  success: string;
  appShell: string;
  appSidebar: string;
  appTopbar: string;
  appHover: string;
  searchBg: string;
  searchBorder: string;
  searchText: string;
  brand: string;
  brandSoft: string;
  brandMuted: string;
  screenGradient: readonly [string, string, ...string[]];
  authGradient: readonly [string, string, ...string[]];
};

export const lightColors: ThemeColors = {
  background: '#f8fafc',
  foreground: '#1e293b',
  card: '#ffffff',
  cardForeground: '#1e293b',
  border: '#e2e8f0',
  inputBg: '#ffffff',
  inputBorder: '#e2e8f0',
  primary: '#000000',
  primaryForeground: '#ffffff',
  secondary: '#f1f5f9',
  secondaryForeground: '#334155',
  muted: '#f1f5f9',
  mutedForeground: '#64748b',
  accent: '#f1f5f9',
  accentForeground: '#334155',
  destructive: '#dc2626',
  warning: '#d97706',
  success: '#059669',
  appShell: '#f8fafc',
  appSidebar: '#ffffff',
  appTopbar: '#ffffff',
  appHover: '#f1f5f9',
  searchBg: '#eff6ff',
  searchBorder: '#93c5fd',
  searchText: '#111827',
  brand: '#4f46e5',
  brandSoft: '#8b5cf6',
  brandMuted: 'rgba(79, 70, 229, 0.12)',
  screenGradient: ['#f8fafc', '#f1f5f9', '#eef2ff'],
  authGradient: ['#eef2ff', '#ffffff', '#faf5ff']
};

export const darkColors: ThemeColors = {
  background: '#0b1120',
  foreground: '#e2e8f0',
  card: '#111827',
  cardForeground: '#e2e8f0',
  border: '#1f2937',
  inputBg: '#0f172a',
  inputBorder: '#1f2937',
  primary: '#6366f1',
  primaryForeground: '#f8fafc',
  secondary: '#111827',
  secondaryForeground: '#cbd5e1',
  muted: '#0f172a',
  mutedForeground: '#94a3b8',
  accent: '#0f172a',
  accentForeground: '#cbd5e1',
  destructive: '#dc2626',
  warning: '#d97706',
  success: '#059669',
  appShell: '#0b1120',
  appSidebar: '#0f172a',
  appTopbar: '#0b1120',
  appHover: 'rgba(255, 255, 255, 0.06)',
  searchBg: '#0f172a',
  searchBorder: '#334155',
  searchText: '#e2e8f0',
  brand: '#6366f1',
  brandSoft: '#8b5cf6',
  brandMuted: 'rgba(99, 102, 241, 0.2)',
  screenGradient: ['#0b1120', '#0f172a', '#1e1b4b'],
  authGradient: ['#0f172a', '#0b1120', '#1e1b4b']
};
