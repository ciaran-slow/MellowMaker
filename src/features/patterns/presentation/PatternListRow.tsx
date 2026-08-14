import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import type { PatternSummary } from '@/data/contracts/patternRepository';
import { patternRowAccessibilityLabel } from '@/features/patterns/presentation/patternLabels';
import { CraftPressable } from '@/ui/components/CraftPressable';

type PatternListRowProps = {
  pattern: PatternSummary;
};

export function PatternListRow({ pattern }: PatternListRowProps) {
  const router = useRouter();

  return (
    <CraftPressable
      accessibilityHint="Opens the pattern"
      accessibilityLabel={patternRowAccessibilityLabel(pattern)}
      className="gap-2 bg-surface p-4"
      onPress={() => {
        router.push({
          pathname: '/patterns/[patternId]',
          params: { patternId: pattern.id },
        });
      }}
    >
      <Text className="text-heading text-ink">{pattern.title}</Text>
      {pattern.notes === undefined ? (
        <Text className="text-label text-ink opacity-70">No notes yet</Text>
      ) : (
        <Text className="text-body text-ink" numberOfLines={2}>
          {pattern.notes}
        </Text>
      )}
    </CraftPressable>
  );
}
