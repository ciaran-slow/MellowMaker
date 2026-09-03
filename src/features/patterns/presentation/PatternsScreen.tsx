import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

import { libraryCountLabel } from '@/features/patterns/presentation/patternLabels';
import { PatternListRow } from '@/features/patterns/presentation/PatternListRow';
import { usePatternLibrary } from '@/features/patterns/presentation/usePatternLibrary';
import { useAnnouncement } from '@/ui/accessibility/useAnnouncement';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { useScreenContentInsets } from '@/ui/components/screenLayout';
import tokens from '@/ui/theme/tokens.json';

const READ_FAILED_TITLE = "We couldn't read your patterns";

export function PatternsScreen() {
  const router = useRouter();
  const contentInsets = useScreenContentInsets();
  const { state, loadMore, retry, reload } = usePatternLibrary();

  // Loading completion and failure are spoken on iOS through the announcement
  // seam (A11Y-07); the live regions below remain Android's path. Announced at
  // the screen so the loading→ready transition is seen — a region that mounts
  // already showing its text is skipped by the seam's first-render rule.
  useAnnouncement(
    state.status === 'ready' && state.patterns.length > 0
      ? libraryCountLabel(state.patterns.length)
      : undefined,
  );
  useAnnouncement(state.status === 'failed' ? READ_FAILED_TITLE : undefined);

  // Returning from the editor re-reads the library so a created, renamed, or
  // deleted pattern is reflected without a global store.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const openNewPattern = useCallback(() => {
    router.push('/patterns/new');
  }, [router]);

  return (
    <View
      accessibilityLabel="Patterns screen"
      className="flex-1 bg-background"
      style={{
        paddingTop: contentInsets.paddingTop,
        paddingRight: contentInsets.paddingRight,
        paddingLeft: contentInsets.paddingLeft,
      }}
    >
      <View className="w-full max-w-screen-sm self-center gap-4 pb-4">
        <Text accessibilityRole="header" className="text-display text-ink">
          Patterns
        </Text>
        <CraftPressable
          accessibilityHint="Starts a new pattern"
          accessibilityLabel="New pattern"
          className="flex-row items-center justify-center gap-2 bg-pinkStrong px-6 py-3"
          onPress={openNewPattern}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={tokens.colors.surface}
            name="plus-circle"
            size={tokens.typography.heading.fontSize}
          />
          <Text className="text-label text-surface">New pattern</Text>
        </CraftPressable>
        {state.status === 'ready' && state.patterns.length > 0 ? (
          <Text accessibilityLiveRegion="polite" className="text-label text-ink">
            {libraryCountLabel(state.patterns.length)}
          </Text>
        ) : null}
      </View>

      {state.status === 'loading' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading your patterns"
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
                  {READ_FAILED_TITLE}
                </Text>
              </View>
              <Text className="text-body text-ink">
                Your patterns are saved on this device. Nothing was changed.
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
          accessibilityLabel="Your patterns"
          className="w-full max-w-screen-sm self-center"
          contentContainerStyle={{
            gap: tokens.spacing[3],
            paddingBottom: contentInsets.paddingBottom,
          }}
          data={state.patterns}
          keyExtractor={(pattern) => pattern.id}
          ListEmptyComponent={
            <View className="gap-4">
              <CraftCard accent="teal">
                <Text
                  accessibilityRole="header"
                  className="text-heading text-ink"
                >
                  No patterns yet
                </Text>
                <Text className="text-body text-ink">
                  Keep your projects, steps, and progress together. Start your
                  first pattern to begin.
                </Text>
              </CraftCard>
              <CraftPressable
                accessibilityHint="Starts a new pattern"
                accessibilityLabel="Create your first pattern"
                className="items-center bg-pinkStrong px-6 py-3"
                onPress={openNewPattern}
              >
                <Text className="text-label text-surface">
                  Create your first pattern
                </Text>
              </CraftPressable>
            </View>
          }
          ListFooterComponent={
            state.loadingMore ? (
              <ActivityIndicator
                accessibilityLabel="Loading more patterns"
                color={tokens.colors.teal}
              />
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => <PatternListRow pattern={item} />}
          testID="pattern-results"
        />
      ) : null}
    </View>
  );
}
