import { Text } from 'react-native';

import { CraftCard } from '@/ui/components/CraftCard';
import { Screen } from '@/ui/components/Screen';

export function PatternsScreen() {
  return (
    <Screen accessibilityLabel="Patterns screen">
      <Text accessibilityRole="header" className="text-display text-ink">
        Patterns
      </Text>
      <CraftCard accent="pink">
        <Text accessibilityRole="header" className="text-heading text-ink">
          Keep every project within reach
        </Text>
        <Text className="text-body text-ink">
          Your patterns, steps, and progress will live together for calmer
          making sessions.
        </Text>
      </CraftCard>
    </Screen>
  );
}
