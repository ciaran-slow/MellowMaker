import { Text } from 'react-native';

import { CraftCard } from '@/ui/components/CraftCard';
import { Screen } from '@/ui/components/Screen';

export function DictionaryScreen() {
  return (
    <Screen accessibilityLabel="Stitches screen">
      <Text accessibilityRole="header" className="text-display text-ink">
        Stitches
      </Text>
      <CraftCard
        accessibilityLabel="Stitches foundation card"
        accent="teal"
      >
        <Text accessibilityRole="header" className="text-heading text-ink">
          Your stitch dictionary starts here
        </Text>
        <Text className="text-body text-ink">
          Clear stitch guides will stay close at hand, even when your making
          spot is offline.
        </Text>
      </CraftCard>
    </Screen>
  );
}
