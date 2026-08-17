import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Text, View } from 'react-native';

import type { GuideSummary } from '@/data/contracts/guideRepository';
import { guideRowAccessibilityLabel } from '@/features/guides/presentation/guideLabels';
import { CraftPressable } from '@/ui/components/CraftPressable';
import tokens from '@/ui/theme/tokens.json';

type GuideListRowProps = {
  guide: GuideSummary;
};

const THUMBNAIL_SIZE = 64;

export function GuideListRow({ guide }: GuideListRowProps) {
  const router = useRouter();

  return (
    <CraftPressable
      accessibilityHint="Opens the guide"
      accessibilityLabel={guideRowAccessibilityLabel(guide)}
      className="flex-row items-center gap-3 bg-surface p-4"
      onPress={() => {
        router.push({
          pathname: '/guides/[guideId]',
          params: { guideId: guide.id },
        });
      }}
    >
      <View
        accessibilityElementsHidden
        className="items-center justify-center overflow-hidden rounded-medium bg-background"
        importantForAccessibility="no-hide-descendants"
        style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }}
      >
        {guide.thumbnailUrl === undefined ? (
          <MaterialCommunityIcons
            color={tokens.colors.ink}
            name="youtube"
            size={tokens.typography.heading.fontSize}
          />
        ) : (
          <Image
            resizeMode="cover"
            source={{ uri: guide.thumbnailUrl }}
            style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }}
          />
        )}
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-heading text-ink">{guide.title}</Text>
        {guide.creator === undefined ? (
          <Text className="text-label text-ink opacity-70">
            Imported from YouTube
          </Text>
        ) : (
          <Text className="text-body text-ink" numberOfLines={1}>
            {guide.creator}
          </Text>
        )}
      </View>
    </CraftPressable>
  );
}
