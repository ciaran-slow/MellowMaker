import type { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';

import { useScreenContentInsets } from '@/ui/components/screenLayout';

type ScreenProps = PropsWithChildren<{
  accessibilityLabel: string;
}>;

export function Screen({ accessibilityLabel, children }: ScreenProps) {
  const contentInsets = useScreenContentInsets();

  return (
    <ScrollView
      accessibilityLabel={accessibilityLabel}
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, ...contentInsets }}
    >
      <View className="w-full max-w-screen-sm self-center gap-6">{children}</View>
    </ScrollView>
  );
}
