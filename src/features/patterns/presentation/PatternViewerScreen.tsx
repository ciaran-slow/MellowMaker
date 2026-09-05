import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

import type { CounterOwner } from '@/data/contracts/counterRepository';
import type { PatternProgressView } from '@/domain/patterns/patternProgress';
import { progressSummaryLabel } from '@/features/patterns/presentation/patternLabels';
import { PatternViewerStepRow } from '@/features/patterns/presentation/PatternViewerStepRow';
import {
  useCounter,
  type CounterController,
} from '@/features/patterns/presentation/useCounter';
import { usePatternPositionRestore } from '@/features/patterns/presentation/usePatternPositionRestore';
import { usePatternViewer } from '@/features/patterns/presentation/usePatternViewer';
import { CraftAnnouncement } from '@/ui/accessibility/CraftAnnouncement';
import { useAnnouncement } from '@/ui/accessibility/useAnnouncement';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftCounter } from '@/ui/components/CraftCounter';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { useScreenContentInsets } from '@/ui/components/screenLayout';
import tokens from '@/ui/theme/tokens.json';

const READ_FAILED_TITLE = "We couldn't read this pattern";
const COUNTER_FAILED_TITLE = "We couldn't load this counter";

type PatternViewerScreenProps = {
  patternId: string;
};

/**
 * The interactive working viewer: the pattern's home. It renders the saved steps
 * in order, marks the current/next step, and lets the maker complete or reopen
 * any step with immediate durable writes. Structural editing lives on the child
 * `/patterns/[patternId]/edit` route, reached from the header's "Edit pattern".
 * Like the library it owns its list directly rather than nesting a `FlatList` in
 * a `ScrollView` (NFR-09); the pattern's chrome scrolls *with* the list as its
 * `ListHeaderComponent` (issue #56, matching the guide working view since #43),
 * so only the bounded back control sits outside the scroll surface. It opens
 * **at** the maker's current step (issue #63): the jump is a post-layout
 * `scrollToIndex` rather than the `initialScrollIndex` #56 removed, because a
 * cell's measured offset is content-container-relative and so already includes
 * the header, where `getItemLayout`'s estimated offsets never did.
 */
export function PatternViewerScreen({ patternId }: PatternViewerScreenProps) {
  const router = useRouter();
  const contentInsets = useScreenContentInsets();
  const viewer = usePatternViewer(patternId);
  const { refresh } = viewer;

  // A stable owner so the counter's load effect resolves once rather than
  // looping; the counter is keyed by this pattern, so a count never leaks
  // between projects (FR-CO-05).
  const counterOwner = useMemo<CounterOwner>(
    () => ({ kind: 'pattern', id: patternId }),
    [patternId],
  );
  const counter = useCounter(counterOwner);

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

  // Exactly one step is ever `current` (`resolvePatternProgressView`), and there
  // is none at all when the pattern is empty or fully complete — `findIndex`
  // returns -1 there, which the hook's `<= 0` guard treats as "nothing to do".
  const currentStepIndex =
    state.status === 'ready'
      ? state.view.steps.findIndex((step) => step.status === 'current')
      : undefined;
  const {
    onContentSizeChange: onStepsContentSizeChange,
    onScrollToIndexFailed: onStepsScrollToIndexFailed,
    registerList: registerStepList,
  } = usePatternPositionRestore(currentStepIndex);

  // VoiceOver never reads a live region, so the failure titles are spoken
  // through the iOS announcement seam as well (A11Y-07); Android hears the
  // assertive alert regions below.
  useAnnouncement(state.status === 'failed' ? READ_FAILED_TITLE : undefined);
  useAnnouncement(
    counter.state.status === 'failed' ? COUNTER_FAILED_TITLE : undefined,
  );

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
      <View className="w-full max-w-screen-sm self-center pb-4">
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
                  {READ_FAILED_TITLE}
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
          className="w-full max-w-screen-sm flex-1 self-center"
          contentContainerStyle={{
            gap: tokens.spacing[3],
            paddingBottom: contentInsets.paddingBottom,
          }}
          data={state.view.steps}
          keyExtractor={(step) => step.id}
          /*
            Opening at the maker's current step (issue #63). `onContentSizeChange`
            is the single trigger: it fires once the content container — the
            header cell included — has been laid out, and re-fires on each fill
            batch, so the retry and the convergence are the same mechanism.
            `onScrollToIndexFailed` must be present (`VirtualizedList` asserts it
            when there is no `getItemLayout`) and must scroll nothing: its
            `averageItemLength × index` is the header-unaware arithmetic #56
            removed. The policy lives in `usePatternPositionRestore`.
          */
          onContentSizeChange={onStepsContentSizeChange}
          onScrollToIndexFailed={onStepsScrollToIndexFailed}
          ref={registerStepList}
          /*
            The pattern's chrome scrolls WITH the steps (issue #56). It must be
            an element of a module-level component type, never an inline
            `() => (<View>…</View>)`: an inline function is a new component type
            on every render, so React would unmount and remount this subtree —
            resetting the counter's local state and dropping an open rename
            draft and its keyboard focus — on every completion or counter tap.
          */
          ListHeaderComponent={
            <PatternViewerHeader
              announcement={state.announcement}
              counter={counter}
              onOpenEditor={openEditor}
              title={state.pattern.title}
              view={state.view}
            />
          }
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
                className="items-center bg-pinkStrong px-6 py-3"
                onPress={openEditor}
              >
                <Text className="text-label text-surface">Edit pattern</Text>
              </CraftPressable>
            </View>
          }
          /*
            The counter's rename opens a text field and a "Save name" button
            inside this scroll surface; the default `"never"` would spend the
            first tap dismissing the keyboard, so saving a new name would need
            two taps.
          */
          keyboardShouldPersistTaps="handled"
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

type PatternViewerHeaderProps = {
  title: string;
  view: PatternProgressView;
  announcement: string;
  counter: CounterController;
  onOpenEditor(): void;
};

/**
 * The pattern's chrome — title, progress summary with "Edit pattern", the
 * counter, and the completion announcement — rendered as the step list's
 * `ListHeaderComponent` so the whole working view is one scroll surface
 * (issue #56). Before this, the chrome was a sibling *above* the list and the
 * list carried no `flex-1`, so the list's height was whatever the chrome left:
 * 639pt of chrome on a 390x844 phone leaves 205pt — under one and a half step
 * rows — 55pt on an iPhone SE class phone, and nothing at all at iOS
 * accessibility text sizes, which is the freeze #43 fixed for the guide view.
 *
 * It is declared at module scope, and calls no hook of its own, so its component
 * type is stable across renders and a completion or counter tap reconciles the
 * header rather than remounting it — which would drop an open rename draft and
 * its keyboard focus. It carries no `max-w-screen-sm self-center`: the
 * `FlatList` already constrains and centres this column, and constraining twice
 * would centre a narrower column inside the centred one.
 */
function PatternViewerHeader({
  announcement,
  counter,
  onOpenEditor,
  title,
  view,
}: PatternViewerHeaderProps) {
  return (
    <View className="w-full gap-4 pb-4">
      <Text accessibilityRole="header" className="text-display text-ink">
        {title}
      </Text>
      <View className="flex-row items-center justify-between gap-3">
        <CraftAnnouncement
          className="flex-1 text-label text-ink"
          message={progressSummaryLabel(view.completedCount, view.totalCount)}
        />
        <CraftPressable
          accessibilityHint="Change this pattern's steps, title, or notes"
          accessibilityLabel="Edit pattern"
          className="flex-row items-center gap-2 bg-surface px-4 py-2"
          onPress={onOpenEditor}
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
        The maker-labelled project counter (FR-CO, issue #7). It sits directly
        above the step list so "+" stays one short flick away one-handed
        (UX-06); since #56 it scrolls with the steps rather than standing on
        top of them. Its read failure is screen-local and retryable, so it
        never blacks out the steps.
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
        The polite live region below speaks completion and position changes to a
        screen reader (A11Y-07).
      */}
      <CraftAnnouncement
        className="text-label text-ink opacity-70"
        message={announcement}
      />
    </View>
  );
}
