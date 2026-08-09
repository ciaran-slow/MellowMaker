import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import type { StitchSummary } from '@/data/contracts/stitchRepository';
import {
  DIFFICULTY_LABEL,
  stitchRowAccessibilityLabel,
} from '@/features/dictionary/presentation/stitchLabels';
import { CraftPressable } from '@/ui/components/CraftPressable';

type StitchListRowProps = {
  stitch: StitchSummary;
};

export function StitchListRow({ stitch }: StitchListRowProps) {
  const router = useRouter();

  return (
    <CraftPressable
      accessibilityHint="Opens the full stitch guide"
      accessibilityLabel={stitchRowAccessibilityLabel(stitch)}
      className="gap-2 bg-surface p-4"
      onPress={() => {
        router.push({
          pathname: '/dictionary/[stitchId]',
          params: { stitchId: stitch.id },
        });
      }}
    >
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-heading text-ink">{stitch.name}</Text>
        <Text className="rounded-pill bg-yellow px-2 py-1 text-label text-ink">
          {stitch.abbreviation}
        </Text>
      </View>
      <Text className="text-label text-ink">
        {DIFFICULTY_LABEL[stitch.difficulty]}
      </Text>
      <Text className="text-body text-ink" numberOfLines={2}>
        {stitch.summary}
      </Text>
    </CraftPressable>
  );
}
