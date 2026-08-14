import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

import { progressSummaryLabel } from '@/features/patterns/presentation/patternLabels';
import { PatternViewerStepRow } from '@/features/patterns/presentation/PatternViewerStepRow';
import { usePatternViewer } from '@/features/patterns/presentation/usePatternViewer';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { useScreenContentInsets } from '@/ui/components/screenLayout';
import tokens from '@/ui/theme/tokens.json';

type PatternViewerScreenProps = {
  patternId: string;
};

// An average row height used only to let the list jump the current step into
// view on open (FR-PV-05). Rows still lay out at their real size; this estimate
// only feeds `initialScrollIndex`, so approximate is fine and precise
// on-device scroll position is the deferred smoke item.
const ESTIMATED_STEP_HEIGHT = 132;

/**
 * The interactive working viewer: the pattern's home. It renders the saved steps
 * in order, marks the current/next step, and lets the maker complete or reopen
 * any step with immediate durable writes. Structural editing lives on the child
 * `/patterns/[patternId]/edit` route, reached from the header's "Edit pattern".
 * Like the library it owns its list directly rather than nesting a `FlatList` in
 * a `ScrollView` (NFR-09).
 */
export function PatternViewerScreen({ patternId }: PatternViewerScreenProps) {
  const router = useRouter();
  const contentInsets = useScreenContentInsets();
  const viewer = usePatternViewer(patternId);
  const { refresh } = viewer;

  // Returning from the editor re-reads the pattern so an edited/reordered/deleted
  // step and the restored position are reflected without a global store. The
  // effect depends on the stable `refresh`, never the per-render `viewer`, so a
  // focused screen refreshes once rather than looping.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/patterns');
    }
  }, [router]);

  const openEditor = useCallback(() => {
    router.push({
      pathname: '/patterns/[patternId]/edit',
      params: { patternId },
    });
  }, [router, patternId]);

  const { state } = viewer;

  const currentIndex =
    state.status === 'ready'
      ? state.view.steps.findIndex(
          (step) => step.id === state.view.currentStepId,
        )
      : -1;

  return (
    <View
      accessibilityLabel="Pattern viewer screen"
      className="flex-1 bg-background"
      style={{
        paddingTop: contentInsets.paddingTop,
        paddingRight: contentInsets.paddingRight,
        paddingLeft: contentInsets.paddingLeft,
      }}
    >
      <View className="w-full max-w-screen-sm self-center gap-4 pb-4">
        <CraftPressable
          accessibilityLabel="Back to patterns"
          className="items-center self-start bg-surface px-4"
          onPress={goBack}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={tokens.colors.ink}
            name="arrow-left"
            size={tokens.typography.heading.fontSize}
          />
        </CraftPressable>

        {state.status === 'ready' ? (
          <>
            <Text accessibilityRole="header" className="text-display text-ink">
              {state.pattern.title}
            </Text>
            <View className="flex-row items-center justify-between gap-3">
              <Text
                accessibilityLiveRegion="polite"
                className="flex-1 text-label text-ink"
              >
                {progressSummaryLabel(
                  state.view.completedCount,
                  state.view.totalCount,
                )}
              </Text>
              <CraftPressable
                accessibilityHint="Change this pattern's steps, title, or notes"
                accessibilityLabel="Edit pattern"
                className="flex-row items-center gap-2 bg-surface px-4 py-2"
                onPress={openEditor}
              >
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={tokens.colors.ink}
                  name="pencil"
                  size={tokens.typography.body.fontSize}
                />
                <Text className="text-label text-ink">Edit pattern</Text>
              </CraftPressable>
            </View>
            {/*
              The row/stitch counter (FR-CO, issue #7) will mount here; this PR
              ships no counter. The polite live region below speaks completion
              and position changes to a screen reader (A11Y-07).
            */}
            <Text
              accessibilityLiveRegion="polite"
              className="text-label text-ink opacity-70"
            >
              {state.announcement}
            </Text>
          </>
        ) : null}
      </View>

      {state.status === 'loading' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading this pattern"
          accessibilityState={{ busy: true }}
          accessibilityLiveRegion="polite"
          className="w-full max-w-screen-sm self-center"
        >
          <ActivityIndicator color={tokens.colors.teal} size="large" />
        </View>
      ) : null}

      {state.status === 'missing' ? (
        <View className="w-full max-w-screen-sm self-center">
          <CraftCard accent="teal">
            <Text accessibilityRole="header" className="text-heading text-ink">
              This pattern is no longer here
            </Text>
            <Text className="text-body text-ink">
              It may have been deleted. Go back to your library to keep making.
            </Text>
          </CraftCard>
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
                  We couldn&apos;t read this pattern
                </Text>
              </View>
              <Text className="text-body text-ink">
                Your pattern is saved on this device. Nothing was changed.
              </Text>
            </CraftCard>
          </View>
          <CraftPressable
            accessibilityLabel="Try again"
            className="items-center bg-yellow px-6 py-3"
            onPress={viewer.retry}
          >
            <Text className="text-label text-ink">Try again</Text>
          </CraftPressable>
        </View>
      ) : null}

      {state.status === 'ready' ? (
        <FlatList
          accessibilityLabel="Pattern steps"
          className="w-full max-w-screen-sm self-center"
          contentContainerStyle={{
            gap: tokens.spacing[3],
            paddingBottom: contentInsets.paddingBottom,
          }}
          data={state.view.steps}
          initialScrollIndex={currentIndex >= 0 ? currentIndex : undefined}
          keyExtractor={(step) => step.id}
          ListEmptyComponent={
            <View className="gap-4">
              <CraftCard accent="teal">
                <Text
                  accessibilityRole="header"
                  className="text-heading text-ink"
                >
                  No steps yet
                </Text>
                <Text className="text-body text-ink">
                  Add the pattern&apos;s steps to start tracking your progress.
                </Text>
              </CraftCard>
              <CraftPressable
                accessibilityLabel="Edit pattern"
                className="items-center bg-pink px-6 py-3"
                onPress={openEditor}
              >
                <Text className="text-label text-ink">Edit pattern</Text>
              </CraftPressable>
            </View>
          }
          getItemLayout={(_data, index) => ({
            length: ESTIMATED_STEP_HEIGHT,
            offset: ESTIMATED_STEP_HEIGHT * index,
            index,
          })}
          renderItem={({ item }) => (
            <PatternViewerStepRow
              onComplete={() => {
                viewer.completeStep(item.id);
              }}
              onReopen={() => {
                viewer.reopenStep(item.id);
              }}
              onSelect={() => {
                viewer.selectStep(item.id);
              }}
              step={item}
              total={state.view.totalCount}
            />
          )}
          testID="pattern-steps"
        />
      ) : null}
    </View>
  );
}
