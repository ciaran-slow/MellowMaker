import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

import { guideCountLabel } from '@/features/guides/presentation/guideLabels';
import { GuideListRow } from '@/features/guides/presentation/GuideListRow';
import { useGuideLibrary } from '@/features/guides/presentation/useGuideLibrary';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { useScreenContentInsets } from '@/ui/components/screenLayout';
import tokens from '@/ui/theme/tokens.json';

export function GuidesScreen() {
  const router = useRouter();
  const contentInsets = useScreenContentInsets();
  const { state, loadMore, retry, reload } = useGuideLibrary();

  // Returning from import or a guide re-reads the library so a created or deleted
  // guide is reflected without a global store.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const openImport = useCallback(() => {
    router.push('/guides/import');
  }, [router]);

  return (
    <View
      accessibilityLabel="Guides screen"
      className="flex-1 bg-background"
      style={{
        paddingTop: contentInsets.paddingTop,
        paddingRight: contentInsets.paddingRight,
        paddingLeft: contentInsets.paddingLeft,
      }}
    >
      <View className="w-full max-w-screen-sm self-center gap-4 pb-4">
        <Text accessibilityRole="header" className="text-display text-ink">
          Guides
        </Text>
        <CraftPressable
          accessibilityHint="Paste a YouTube link to import a guide"
          accessibilityLabel="Import from YouTube"
          className="flex-row items-center justify-center gap-2 bg-pink px-6 py-3"
          onPress={openImport}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={tokens.colors.ink}
            name="youtube"
            size={tokens.typography.heading.fontSize}
          />
          <Text className="text-label text-ink">Import from YouTube</Text>
        </CraftPressable>
        {state.status === 'ready' && state.guides.length > 0 ? (
          <Text accessibilityLiveRegion="polite" className="text-label text-ink">
            {guideCountLabel(state.guides.length)}
          </Text>
        ) : null}
      </View>

      {state.status === 'loading' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading your guides"
          accessibilityState={{ busy: true }}
          accessibilityLiveRegion="polite"
          className="w-full max-w-screen-sm self-center"
        >
          <ActivityIndicator color={tokens.colors.teal} size="large" />
        </View>
      ) : null}

      {state.status === 'failed' ? (
        <View className="w-full max-w-screen-sm self-center gap-4">
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
                  We couldn&apos;t read your guides
                </Text>
              </View>
              <Text className="text-body text-ink">
                Your guides are saved on this device. Nothing was changed.
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
        </View>
      ) : null}

      {state.status === 'ready' ? (
        <FlatList
          accessibilityLabel="Your guides"
          className="w-full max-w-screen-sm self-center"
          contentContainerStyle={{
            gap: tokens.spacing[3],
            paddingBottom: contentInsets.paddingBottom,
          }}
          data={state.guides}
          keyExtractor={(guide) => guide.id}
          ListEmptyComponent={
            <View className="gap-4">
              <CraftCard accent="teal">
                <Text
                  accessibilityRole="header"
                  className="text-heading text-ink"
                >
                  No guides yet
                </Text>
                <Text className="text-body text-ink">
                  Turn a YouTube tutorial into a guide you can return to. Import
                  your first one to begin.
                </Text>
              </CraftCard>
              <CraftPressable
                accessibilityHint="Paste a YouTube link to import a guide"
                accessibilityLabel="Import your first guide"
                className="items-center bg-pink px-6 py-3"
                onPress={openImport}
              >
                <Text className="text-label text-ink">
                  Import your first guide
                </Text>
              </CraftPressable>
            </View>
          }
          ListFooterComponent={
            state.loadingMore ? (
              <ActivityIndicator
                accessibilityLabel="Loading more guides"
                color={tokens.colors.teal}
              />
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => <GuideListRow guide={item} />}
          testID="guide-results"
        />
      ) : null}
    </View>
  );
}
