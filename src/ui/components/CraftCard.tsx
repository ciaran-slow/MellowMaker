import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

type CraftCardProps = PropsWithChildren<{
  accent: 'pink' | 'yellow' | 'teal' | 'blue';
}>;

const accentClasses: Record<CraftCardProps['accent'], string> = {
  pink: 'border-pink',
  yellow: 'border-yellow',
  teal: 'border-teal',
  blue: 'border-blue',
};

export function CraftCard({ accent, children }: CraftCardProps) {
  return (
    <View
      className={`gap-3 rounded-large border-l-8 ${accentClasses[accent]} bg-surface p-6 shadow-sm`}
    >
      {children}
    </View>
  );
}
