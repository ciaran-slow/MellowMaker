import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { DIFFICULTY_LABEL } from '@/features/dictionary/presentation/stitchLabels';
import { useStitchDetail } from '@/features/dictionary/presentation/useStitchDetail';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { Screen } from '@/ui/components/Screen';
import tokens from '@/ui/theme/tokens.json';

type StitchDetailScreenProps = {
  stitchId: string;
};

export function StitchDetailScreen({ stitchId }: StitchDetailScreenProps) {
  const router = useRouter();
  const { state, retry } = useStitchDetail(stitchId);

  return (
    <Screen accessibilityLabel="Stitch detail screen">
      <CraftPressable
        accessibilityLabel="Back to stitches"
        className="items-center self-start bg-surface px-4"
        onPress={() => {
          // A deep link opens this screen with nothing behind it, so falling
          // back to the list keeps the control from being dead.
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/dictionary');
          }
        }}
      >
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={tokens.colors.ink}
          name="arrow-left"
          size={tokens.typography.heading.fontSize}
        />
      </CraftPressable>

      {state.status === 'loading' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading this stitch"
          accessibilityState={{ busy: true }}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator color={tokens.colors.teal} size="large" />
        </View>
      ) : null}

      {state.status === 'missing' ? (
        <CraftCard accent="teal">
          <Text accessibilityRole="header" className="text-heading text-ink">
            That stitch isn&apos;t in your dictionary
          </Text>
          <Text className="text-body text-ink">
            It may have been renamed or removed. Go back to browse the stitches
            you do have.
          </Text>
        </CraftCard>
      ) : null}

      {state.status === 'failed' ? (
        <>
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            <CraftCard accent="pink">
              <View className="flex-row items-center gap-3">
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={tokens.colors.pink}
                  name="alert-circle"
                  size={tokens.typography.heading.fontSize}
                />
                <Text
                  accessibilityRole="header"
                  className="flex-1 text-heading text-ink"
                >
                  We couldn&apos;t read your stitch dictionary
                </Text>
              </View>
              <Text className="text-body text-ink">
                Your stitches are saved on this device. Nothing was changed.
              </Text>
            </CraftCard>
          </View>
          <CraftPressable
            accessibilityLabel="Try again"
            className="items-center bg-yellow px-6 py-3"
            onPress={retry}
          >
            <Text className="text-label text-ink">Try again</Text>
          </CraftPressable>
        </>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <Text accessibilityRole="header" className="text-display text-ink">
            {state.stitch.name}
          </Text>
          <View className="gap-2">
            <Text className="text-label text-ink">
              {`Abbreviation ${state.stitch.abbreviation}`}
            </Text>
            <Text className="text-label text-ink">
              {`Difficulty ${DIFFICULTY_LABEL[state.stitch.difficulty]}`}
            </Text>
          </View>
          <Text className="text-body text-ink">{state.stitch.summary}</Text>

          <Text accessibilityRole="header" className="text-heading text-ink">
            Steps
          </Text>
          <View className="gap-3">
            {state.stitch.instructions.map((instruction, index) => (
              <View
                accessible
                accessibilityLabel={`Step ${index + 1} of ${state.stitch.instructions.length}: ${instruction.instruction}`}
                className="flex-row items-start gap-3 rounded-large bg-surface p-4"
                key={instruction.id}
              >
                <Text className="rounded-pill bg-yellow px-3 py-1 text-label text-ink">
                  {index + 1}
                </Text>
                <Text className="flex-1 text-body text-ink">
                  {instruction.instruction}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
