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
import {
  useGuidePlayer,
  type GuidePlayer,
} from '@/features/guides/presentation/useGuidePlayer';
import { useGuideViewer } from '@/features/guides/presentation/useGuideViewer';
import {
  useCounter,
  type CounterController,
} from '@/features/patterns/presentation/useCounter';
import { CraftAnnouncement } from '@/ui/accessibility/CraftAnnouncement';
import { useAnnouncement } from '@/ui/accessibility/useAnnouncement';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftCounter } from '@/ui/components/CraftCounter';
import { CraftPressable } from '@/ui/components/CraftPressable';
import {
  useScreenContentInsets,
  type ScreenContentInsets,
} from '@/ui/components/screenLayout';
import tokens from '@/ui/theme/tokens.json';

const OPEN_FAILED_TITLE = "We couldn't open this guide";
const COUNTER_FAILED_TITLE = "We couldn't load this counter";

type GuideWorkingViewScreenProps = {
  guideId: string;
};

/**
 * The interactive guide working view — the guide's home. It shows the compliant
 * YouTube IFrame player (the #11 seam, filled) above an always-rendered,
 * always-interactive step list, marks the current/next step, and lets the maker
 * complete or reopen any step with immediate durable writes. The guide's own
 * maker-labelled counter (reused unchanged from #7) sits directly above the
 * steps. Structural editing lives on the child `/guides/[guideId]/edit` route,
 * reached from "Edit guide". Like the pattern viewer it owns its `FlatList`
 * directly rather than nesting one in a `ScrollView` (NFR-09); the guide's
 * chrome scrolls *with* the list as its `ListHeaderComponent` (issue #43), so
 * only the bounded back control sits outside the scroll surface.
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

  // Defined here, not inline on the header element, so `GuideWorkingViewHeader`
  // keeps a stable component type and the WebView below is never remounted.
  const openSaveAsPattern = useCallback(() => {
    router.push({
      pathname: '/guides/[guideId]/save-as-pattern',
      params: { guideId },
    });
  }, [router, guideId]);

  const { state } = viewer;

  // VoiceOver never reads a live region, so the failure title is spoken through
  // the iOS announcement seam as well (A11Y-07).
  useAnnouncement(state.status === 'failed' ? OPEN_FAILED_TITLE : undefined);

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
                  {OPEN_FAILED_TITLE}
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
          onOpenSaveAsPattern={openSaveAsPattern}
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
  onOpenSaveAsPattern(): void;
  onCompleteStep(stepId: string): void;
  onReopenStep(stepId: string): void;
};

/**
 * The ready-state body of the working view. It exists so the player and counter
 * hooks are called unconditionally (they run only once a guide has loaded), and
 * so the single `useGuidePlayer` instance is shared between the video card in
 * the list header and every step row's seek badge below. The player rides in the
 * list's `ListHeaderComponent`; whatever its status, it never gates or disables
 * the saved instructions, completion, counter, or progress.
 */
function GuideWorkingViewReady({
  announcement,
  contentInsets,
  guide,
  guideId,
  onCompleteStep,
  onOpenEditor,
  onOpenSaveAsPattern,
  onReopenStep,
  steps,
  view,
}: GuideWorkingViewReadyProps) {
  const player = useGuidePlayer(guide.videoId);
  const { release, resume } = player;

  // Release the WebView player on BLUR, not only on unmount (NFR-10 / AC#4).
  // Guide routes are flat, hidden bottom-tab screens, so navigating away can
  // leave this view mounted (the `canGoBack()===false` `replace('/guides')`
  // fallback). `useFocusEffect`'s cleanup runs on blur regardless, so it releases
  // the player and suppresses stale callbacks on both the unmounting back-history
  // path and the still-mounted replace path. Focus re-arms and re-mounts it.
  useFocusEffect(
    useCallback(() => {
      resume();

      return () => {
        release();
      };
    }, [release, resume]),
  );

  // A stable owner so the counter's load effect resolves once; the counter is
  // keyed by this guide, so a count never leaks between guides or patterns
  // (FR-CO-05).
  const counterOwner = useMemo<CounterOwner>(
    () => ({ kind: 'guide', id: guideId }),
    [guideId],
  );
  const counter = useCounter(counterOwner);
  useAnnouncement(
    counter.state.status === 'failed' ? COUNTER_FAILED_TITLE : undefined,
  );

  return (
    <FlatList
      accessibilityLabel="Guide steps"
      className="w-full max-w-screen-sm flex-1 self-center"
      contentContainerStyle={{
        gap: tokens.spacing[3],
        paddingBottom: contentInsets.paddingBottom,
      }}
      data={view.steps}
      keyExtractor={(step) => step.id}
      /*
        The guide's chrome scrolls WITH the steps (issue #43). It must be an
        element of a module-level component type, never an inline
        `() => (<View>…</View>)`: an inline function is a new component type on
        every render, so React would unmount and remount this subtree — tearing
        down and reloading the YouTube WebView — on every completion or counter
        tap.
      */
      ListHeaderComponent={
        <GuideWorkingViewHeader
          announcement={announcement}
          counter={counter}
          guide={guide}
          onOpenEditor={onOpenEditor}
          onOpenSaveAsPattern={onOpenSaveAsPattern}
          player={player}
          view={view}
        />
      }
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
            className="items-center bg-pinkStrong px-6 py-3"
            onPress={onOpenEditor}
          >
            <Text className="text-label text-surface">Edit guide</Text>
          </CraftPressable>
        </View>
      }
      /*
        The counter's rename opens a text field and a "Save name" button inside
        this scroll surface; the default `"never"` would spend the first tap
        dismissing the keyboard, so saving a new name would need two taps.
      */
      keyboardShouldPersistTaps="handled"
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
  );
}

type GuideWorkingViewHeaderProps = {
  guide: ImportedGuide;
  view: PatternProgressView;
  announcement: string;
  player: GuidePlayer;
  counter: CounterController;
  onOpenEditor(): void;
  onOpenSaveAsPattern(): void;
};

/**
 * The guide's chrome — title, progress summary with "Edit guide", the video
 * card, the counter, and the completion announcement — rendered as the step
 * list's `ListHeaderComponent` so the whole working view is one scroll surface
 * (issue #43). Before this, the chrome was a sibling *above* the list and, with
 * the 16:9 video card in it, stood ~897pt tall on an 844pt phone: the list was
 * laid out entirely off-screen and nothing on the display responded to a swipe.
 *
 * It is declared at module scope, and calls no hook of its own, so its component
 * type is stable across renders and the WebView below is never remounted by a
 * completion or counter tap. It carries no `max-w-screen-sm self-center`: the
 * `FlatList` already constrains and centres this column, and constraining twice
 * would centre a narrower column inside the centred one.
 */
function GuideWorkingViewHeader({
  announcement,
  counter,
  guide,
  onOpenEditor,
  onOpenSaveAsPattern,
  player,
  view,
}: GuideWorkingViewHeaderProps) {
  return (
    <View className="w-full gap-4 pb-4">
      <Text accessibilityRole="header" className="text-display text-ink">
        {guide.title}
      </Text>
      <CraftAnnouncement
        className="text-label text-ink"
        message={progressSummaryLabel(view.completedCount, view.totalCount)}
      />
      {/*
        The two guide actions are equal `flex-1` siblings on their own row rather
        than a third element beside the progress line: at 390pt, two icon+text
        buttons would push the progress string to three lines at large Dynamic
        Type. The extra row cannot starve the step list — since #43 the list
        carries `flex-1`, so its height never depends on this header's content.
      */}
      <View className="flex-row gap-3">
        <CraftPressable
          accessibilityHint="Change this guide's steps, title, or notes"
          accessibilityLabel="Edit guide"
          className="flex-1 flex-row items-center justify-center gap-2 bg-surface px-4 py-2"
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
        {/*
          Disabled when the guide has nothing to copy: an imported guide starts
          with zero steps, so an unconditional control would put an empty,
          useless pattern in the library on the most common path. The review
          screen applies the same rule, because that route is reachable by deep
          link and the last step can be deleted elsewhere.
        */}
        <CraftPressable
          accessibilityHint="Copy this guide's steps into a new pattern"
          accessibilityLabel="Save as pattern"
          className="flex-1 flex-row items-center justify-center gap-2 bg-tealStrong px-4 py-2"
          disabled={view.totalCount === 0}
          onPress={onOpenSaveAsPattern}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={tokens.colors.surface}
            name="content-save-outline"
            size={tokens.typography.body.fontSize}
          />
          <Text className="text-label text-surface">Save as pattern</Text>
        </CraftPressable>
      </View>

      {/*
        The compliant YouTube IFrame player (issue #11). Since #43 it rides in
        the list's `ListHeaderComponent` with the rest of the chrome, and it
        never gates or disables the steps: loading, offline, and playback-error
        all degrade to text while the saved steps stay usable.
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
              {COUNTER_FAILED_TITLE}
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
      <CraftAnnouncement
        className="text-label text-ink opacity-70"
        message={announcement}
      />
    </View>
  );
}
