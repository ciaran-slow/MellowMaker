import { Text } from 'react-native';

import { CraftCard } from '@/ui/components/CraftCard';
import { Screen } from '@/ui/components/Screen';

export function GuidesScreen() {
  return (
    <Screen accessibilityLabel="Guides screen">
      <Text accessibilityRole="header" className="text-display text-ink">
        Guides
      </Text>
      <CraftCard
        accessibilityLabel="Guides foundation card"
        accent="blue"
      >
        <Text accessibilityRole="header" className="text-heading text-ink">
          Turn tutorials into making steps
        </Text>
        <Text className="text-body text-ink">
          Saved guide notes and timestamps will help you return to the exact
          place you left off.
        </Text>
      </CraftCard>
    </Screen>
  );
}
