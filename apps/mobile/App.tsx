import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppProviders } from './src/providers/AppProviders';
import { useTheme } from './src/theme/ThemeProvider';

function Shell() {
  const { theme, resolvedMode } = useTheme();
  const navigationTheme = useMemo(() => {
    const base = resolvedMode === 'dark' ? DarkTheme : DefaultTheme;
    const c = theme.colors;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: c.bg,
        card: c.surface,
        border: c.border,
        text: c.fg,
        primary: c.primary,
      },
    };
  }, [resolvedMode, theme.colors]);
  return (
    <>
      <NavigationContainer theme={navigationTheme}>
        <RootNavigator />
      </NavigationContainer>
      <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

export default function App() {
  return (
    <AppProviders>
      <Shell />
    </AppProviders>
  );
}
