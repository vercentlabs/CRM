import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import React, { useMemo } from 'react';
import { LogBox } from 'react-native';

LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

const AppShell = () => {
  const { theme, resolvedMode } = useTheme();

  const navigationTheme = useMemo(() => {
    const baseTheme = resolvedMode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: theme.colors.appShell,
        card: theme.colors.card,
        border: theme.colors.border,
        text: theme.colors.foreground,
        primary: theme.colors.brand
      }
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
};

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
