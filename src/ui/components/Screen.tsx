import type { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import tokens from '@/ui/theme/tokens.json';

type ScreenProps = PropsWithChildren<{
  accessibilityLabel: string;
}>;

export function Screen({ accessibilityLabel, children }: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      accessibilityLabel={accessibilityLabel}
      className="flex-1 bg-background"
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + tokens.spacing[6],
        paddingRight: tokens.spacing[4],
        paddingBottom: insets.bottom + tokens.spacing[8],
        paddingLeft: tokens.spacing[4],
      }}
    >
      <View className="w-full max-w-screen-sm self-center gap-6">{children}</View>
    </ScrollView>
  );
}
