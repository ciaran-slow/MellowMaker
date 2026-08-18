import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

import type { CounterOwner } from '@/data/contracts/counterRepository';
import type {
  GuideStep,
  ImportedGuide,
} from '@/data/contracts/guideRepository';
import type { PatternProgressView } from '@/domain/patterns/patternProgress';
import { GuideVideoPlayer } from '@/features/guides/presentation/GuideVideoPlayer';
import { GuideViewerStepRow } from '@/features/guides/presentation/GuideViewerStepRow';
import { progressSummaryLabel } from '@/features/guides/presentation/guideStepLabels';
import { useGuidePlayer } from '@/features/guides/presentation/useGuidePlayer';
import { useGuideViewer } from '@/features/guides/presentation/useGuideViewer';
import { useCounter } from '@/features/patterns/presentation/useCounter';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftCounter } from '@/ui/components/CraftCounter';
import { CraftPressable } from '@/ui/components/CraftPressable';
import {
  useScreenContentInsets,
  type ScreenContentInsets,
} from '@/ui/components/screenLayout';
import tokens from '@/ui/theme/tokens.json';

type GuideWorkingViewScreenProps = {
  guideId: string;
};

// An average row height used only to let the list jump the current step into
// view on open. Rows still lay out at their real size; this estimate only feeds
// `initialScrollIndex`, so approximate is fine.
const ESTIMATED_STEP_HEIGHT = 148;

/**
 * The interactive guide working view — the guide's home. It shows the compliant
 * YouTube IFrame player (the #11 seam, filled) above an always-rendered,
 * always-interactive step list, marks the current/next step, and lets the maker
 * complete or reopen any step with immediate durable writes. The guide's own
 * maker-labelled counter (reused unchanged from #7) is pinned above the list.
 * Structural editing lives on the child `/guides/[guideId]/edit` route, reached
 * from "Edit guide". Like the pattern viewer it owns its `FlatList` directly
 * rather than nesting one in a `ScrollView` (NFR-09).
 */
export function GuideWorkingViewScreen({
  guideId,
}: GuideWorkingViewScreenProps) {
  const router = useRouter();
  const contentInsets = useScreenContentInsets();
  const viewer = useGuideViewer(guideId);
  const { refresh } = viewer;

  // Returning from the editor re-reads the guide so an edited/reordered/deleted
  // step is reflected. Depends on the stable `refresh`, never the per-render
  // `viewer`, so a focused screen refreshes once rather than looping.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/guides');
    }
  }, [router]);

  const openEditor = useCallback(() => {
    router.push({
      pathname: '/guides/[guideId]/edit',
      params: { guideId },
    });
  }, [router, guideId]);

  const { state } = viewer;

  return (
    <View
      accessibilityLabel="Guide working view screen"
      className="flex-1 bg-background"
      style={{
        paddingTop: contentInsets.paddingTop,
        paddingRight: contentInsets.paddingRight,
        paddingLeft: contentInsets.paddingLeft,
      }}
    >
      <View className="w-full max-w-screen-sm self-center pb-4">
        <CraftPressable
          accessibilityLabel="Back to guides"
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
      </View>

      {state.status === 'loading' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading this guide"
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
              This guide is no longer here
            </Text>
            <Text className="text-body text-ink">
              It may have been deleted. Go back to your guides to keep making.
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
                  We couldn&apos;t open this guide
                </Text>
              </View>
              <Text className="text-body text-ink">
                Your guide is saved on this device. Try again — nothing was lost.
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
        <GuideWorkingViewReady
          announcement={state.announcement}
          contentInsets={contentInsets}
          guide={state.guide}
          guideId={guideId}
          onCompleteStep={viewer.completeStep}
          onOpenEditor={openEditor}
          onReopenStep={viewer.reopenStep}
          steps={state.steps}
          view={state.view}
        />
      ) : null}
    </View>
  );
}

type GuideWorkingViewReadyProps = {
  guide: ImportedGuide;
  view: PatternProgressView;
  steps: readonly GuideStep[];
  announcement: string;
  guideId: string;
  contentInsets: ScreenContentInsets;
  onOpenEditor(): void;
  onCompleteStep(stepId: string): void;
  onReopenStep(stepId: string): void;
};

/**
 * The ready-state body of the working view. It exists so the player and counter
 * hooks are called unconditionally (they run only once a guide has loaded), and
 * so the single `useGuidePlayer` instance is shared between the video card above
 * and every step row's seek badge below. The player is a **sibling above** the
 * always-rendered `FlatList`; whatever its status, it never gates or disables the
 * saved instructions, completion, counter, or progress.
 */
function GuideWorkingViewReady({
  announcement,
  contentInsets,
  guide,
  guideId,
  onCompleteStep,
  onOpenEditor,
  onReopenStep,
  steps,
  view,
}: GuideWorkingViewReadyProps) {
  const player = useGuidePlayer(guide.videoId);

  // A stable owner so the counter's load effect resolves once; the counter is
  // keyed by this guide, so a count never leaks between guides or patterns
  // (FR-CO-05).
  const counterOwner = useMemo<CounterOwner>(
    () => ({ kind: 'guide', id: guideId }),
    [guideId],
  );
  const counter = useCounter(counterOwner);

  const currentIndex = view.steps.findIndex(
    (step) => step.id === view.currentStepId,
  );

  return (
    <>
      <View className="w-full max-w-screen-sm self-center gap-4 pb-4">
        <Text accessibilityRole="header" className="text-display text-ink">
          {guide.title}
        </Text>
        <View className="flex-row items-center justify-between gap-3">
          <Text
            accessibilityLiveRegion="polite"
            className="flex-1 text-label text-ink"
          >
            {progressSummaryLabel(view.completedCount, view.totalCount)}
          </Text>
          <CraftPressable
            accessibilityHint="Change this guide's steps, title, or notes"
            accessibilityLabel="Edit guide"
            className="flex-row items-center gap-2 bg-surface px-4 py-2"
            onPress={onOpenEditor}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={tokens.colors.ink}
              name="pencil"
              size={tokens.typography.body.fontSize}
            />
            <Text className="text-label text-ink">Edit guide</Text>
          </CraftPressable>
        </View>

        {/*
          The compliant YouTube IFrame player (issue #11). It is a sibling ABOVE
          the step list and never gates or disables it: loading, offline, and
          playback-error all degrade to text while the saved steps stay usable.
        */}
        <GuideVideoPlayer
          player={player}
          sourceUrl={guide.sourceUrl}
          videoId={guide.videoId}
        />

        {/*
          The maker-labelled guide counter (issue #7, reused unchanged). Its
          read failure is screen-local and retryable, so it never blacks out
          the steps.
        */}
        {counter.state.status === 'ready' ? (
          <CraftCounter
            announcement={counter.state.announcement}
            label={counter.state.label}
            onDecrement={counter.decrement}
            onIncrement={counter.increment}
            onRename={counter.rename}
            onReset={counter.reset}
            value={counter.state.value}
          />
        ) : counter.state.status === 'failed' ? (
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            <CraftCard accent="pink">
              <Text accessibilityRole="header" className="text-heading text-ink">
                We couldn&apos;t load this counter
              </Text>
              <Text className="text-body text-ink">
                Your count is saved on this device. Nothing was changed.
              </Text>
              <CraftPressable
                accessibilityLabel="Try again to load the counter"
                className="items-center self-start bg-yellow px-6 py-3"
                onPress={counter.retry}
              >
                <Text className="text-label text-ink">Try again</Text>
              </CraftPressable>
            </CraftCard>
          </View>
        ) : null}

        {/*
          The polite live region below speaks completion and position changes
          to a screen reader (A11Y-07).
        */}
        <Text
          accessibilityLiveRegion="polite"
          className="text-label text-ink opacity-70"
        >
          {announcement}
        </Text>
      </View>

      <FlatList
        accessibilityLabel="Guide steps"
        className="w-full max-w-screen-sm self-center"
        contentContainerStyle={{
          gap: tokens.spacing[3],
          paddingBottom: contentInsets.paddingBottom,
        }}
        data={view.steps}
        initialScrollIndex={currentIndex >= 0 ? currentIndex : undefined}
        keyExtractor={(step) => step.id}
        ListEmptyComponent={
          <View className="gap-4">
            <CraftCard accent="teal">
              <Text accessibilityRole="header" className="text-heading text-ink">
                No steps yet
              </Text>
              <Text className="text-body text-ink">
                Add this guide&apos;s steps to start tracking your progress.
              </Text>
            </CraftCard>
            <CraftPressable
              accessibilityLabel="Edit guide"
              className="items-center bg-pink px-6 py-3"
              onPress={onOpenEditor}
            >
              <Text className="text-label text-ink">Edit guide</Text>
            </CraftPressable>
          </View>
        }
        getItemLayout={(_data, index) => ({
          length: ESTIMATED_STEP_HEIGHT,
          offset: ESTIMATED_STEP_HEIGHT * index,
          index,
        })}
        renderItem={({ index, item }) => {
          const detail = steps[index];

          return (
            <GuideViewerStepRow
              note={detail?.note}
              onComplete={() => {
                onCompleteStep(item.id);
              }}
              onReopen={() => {
                onReopenStep(item.id);
              }}
              onSeek={player.seekToMs}
              step={item}
              total={view.totalCount}
              transcriptExcerpt={detail?.transcriptExcerpt}
              videoOffsetMs={detail?.videoOffsetMs}
            />
          );
        }}
        testID="guide-steps"
      />
    </>
  );
}
