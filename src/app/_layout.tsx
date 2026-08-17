import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from 'react-native-safe-area-context';

import { createAppDatabase } from '@/platform/database/createAppDatabase';
import { createYoutubeOembedGateway } from '@/platform/network/youtubeOembedGateway';
import '@/styles/global.css';
import { DatabaseGate } from '@/ui/database/DatabaseGate';
import { GuideMetadataContext } from '@/ui/guides/guideMetadataContext';
import tokens from '@/ui/theme/tokens.json';

// One stable gateway for the whole app, built here at the only place that may
// import `src/platform`. Best-effort metadata: every failure degrades to manual
// guide creation, so this never blocks a maker or a saved guide.
const guideMetadataGateway = createYoutubeOembedGateway();

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
          <GuideMetadataContext.Provider value={guideMetadataGateway}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: tokens.colors.background },
              }}
            />
          </GuideMetadataContext.Provider>
        </DatabaseGate>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
