import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from 'react-native-safe-area-context';

import { createAppDatabase } from '@/platform/database/createAppDatabase';
import '@/styles/global.css';
import { DatabaseGate } from '@/ui/database/DatabaseGate';
import tokens from '@/ui/theme/tokens.json';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: tokens.colors.pink,
    background: tokens.colors.background,
    card: tokens.colors.surface,
    text: tokens.colors.ink,
    border: tokens.colors.yellow,
    notification: tokens.colors.pink,
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="dark" />
        <DatabaseGate initialize={createAppDatabase}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: tokens.colors.background },
            }}
          />
        </DatabaseGate>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
