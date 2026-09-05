import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import type { PatternSnapshotDraft } from '@/domain/guides/guidePatternSnapshot';
import { validatePatternTitle } from '@/domain/patterns/patternDraft';
import { guideStepCopyLabel } from '@/features/guides/presentation/guideLabels';
import {
  useGuidePatternDraft,
  type GuidePatternDraft,
} from '@/features/guides/presentation/useGuidePatternDraft';
// A pure label module from the patterns feature, imported rather than copied —
// the same cross-feature reuse `useGuideViewer` makes of
// `@/domain/patterns/patternProgress`. Re-implementing the "Step N of M" grammar
// here would be a second convention beside the shipped one.
import { stepAccessibilityLabel } from '@/features/patterns/presentation/patternLabels';
import { CraftAnnouncement } from '@/ui/accessibility/CraftAnnouncement';
import { useAnnouncement } from '@/ui/accessibility/useAnnouncement';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { CraftTextField } from '@/ui/components/CraftTextField';
import { Screen } from '@/ui/components/Screen';
import tokens from '@/ui/theme/tokens.json';

const SAVE_FAILED_TITLE = "We couldn't save that pattern";

type SaveGuideAsPatternScreenProps = {
  guideId: string;
};

/**
 * The "Save as pattern" review screen (issue #51; architecture §9.3). It seeds
 * itself from the guide — title, the source line that will become the pattern's
 * notes, and every step in position order — and writes nothing until the maker
 * confirms. Confirming commits through the shipped
 * `PatternRepository.createPattern` and replaces the maker onto the new
 * pattern's viewer, the same landing the pattern create flow uses.
 *
 * It is a one-shot snapshot, not an editor: the steps are read-only here (the
 * pattern editor is one tap away afterwards) and the notes are computed rather
 * than typed, so "the canonical watch URL is recorded in `pattern.notes`" is an
 * unconditional property of every conversion rather than one a stray keystroke
 * can void. Only the title is editable, because a YouTube title is often an
 * unsuitable project name.
 */
export function SaveGuideAsPatternScreen({
  guideId,
}: SaveGuideAsPatternScreenProps) {
  const router = useRouter();
  const draft = useGuidePatternDraft(guideId);
  const { state, refresh } = draft;

  // This route is a hidden `Tabs` screen (`href: null`), so it stays mounted
  // once visited: returning to it re-runs no effect of its own. Re-reading on
  // focus is what keeps a second visit a review of the guide rather than of the
  // first visit's draft — the same `useFocusEffect` + stable `refresh` pairing
  // the guide working view and the pattern viewer use. Depends on `refresh`,
  // never the per-render `draft`, so a focused screen refreshes once rather
  // than looping.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // VoiceOver never reads a live region, so the failure title is spoken through
  // the iOS announcement seam as well (A11Y-07).
  useAnnouncement(state.status === 'failed' ? SAVE_FAILED_TITLE : undefined);

  function cancel() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace({ pathname: '/guides/[guideId]', params: { guideId } });
    }
  }

  return (
    <Screen accessibilityLabel="Save guide as pattern screen">
      <CraftPressable
        accessibilityHint="Go back without saving a pattern"
        accessibilityLabel="Cancel"
        className="flex-row items-center gap-2 self-start bg-surface px-4"
        onPress={cancel}
      >
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={tokens.colors.ink}
          name="arrow-left"
          size={tokens.typography.heading.fontSize}
        />
        <Text className="text-label text-ink">Cancel</Text>
      </CraftPressable>

      <Text accessibilityRole="header" className="text-display text-ink">
        Save as pattern
      </Text>

      {/*
        Mounted at SCREEN level, not inside the ready branch: `useAnnouncement`
        is deliberately silent on first render, so an announcement that only
        appears once the draft resolves would never be spoken on iOS. Mounting it
        always makes the resolved count a *change*, which is spoken (A11Y-07).
      */}
      <CraftAnnouncement
        className="text-label text-ink"
        message={
          state.status === 'ready'
            ? guideStepCopyLabel(state.draft.steps.length)
            : ''
        }
      />

      {state.status === 'loading' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading this guide"
          accessibilityState={{ busy: true }}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator color={tokens.colors.teal} size="large" />
        </View>
      ) : null}

      {state.status === 'missing' ? (
        <CraftCard accent="teal">
          <Text accessibilityRole="header" className="text-heading text-ink">
            This guide is no longer here
          </Text>
          <Text className="text-body text-ink">
            It may have been deleted. Go back to your guides to keep making.
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
                  {SAVE_FAILED_TITLE}
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
            onPress={draft.retry}
          >
            <Text className="text-label text-ink">Try again</Text>
          </CraftPressable>
        </>
      ) : null}

      {state.status === 'ready' ? (
        <ReviewForm
          draft={state.draft}
          onSave={draft.save}
          onSaved={(patternId) => {
            router.replace({
              pathname: '/patterns/[patternId]',
              params: { patternId },
            });
          }}
        />
      ) : null}
    </Screen>
  );
}

type ReviewFormProps = {
  draft: PatternSnapshotDraft;
  onSave: GuidePatternDraft['save'];
  onSaved(patternId: string): void;
};

/**
 * The reviewed draft. The title seeds a controlled field — a seed, not a lock —
 * while the source line and the steps are shown exactly as they will be
 * written. Each read of the guide produces a fresh `draft` object, and the field
 * re-seeds from it, so a review re-entered after the guide was renamed shows the
 * guide's current name rather than the previous visit's abandoned edit.
 * Confirming is disabled while the title is empty or the guide has no
 * steps: every guide starts with zero steps (an import saves none), so an
 * unconditional confirm would put an empty, useless pattern in the library on
 * the most common path. The same rule guards the entry control on the working
 * view; it is applied here too because this route is reachable by deep link and
 * the guide's last step can be deleted elsewhere.
 */
function ReviewForm({ draft, onSave, onSaved }: ReviewFormProps) {
  const [title, setTitle] = useState(draft.title);
  // Re-seed when a focus re-read produces a new draft. Keyed on the draft's
  // identity rather than on focus itself: the read resolves a microtask after
  // focus, so resetting at focus time would re-seed from the *stale* draft and
  // miss a guide renamed in between.
  const [seededFrom, setSeededFrom] = useState(draft);
  if (seededFrom !== draft) {
    setSeededFrom(draft);
    setTitle(draft.title);
  }

  const titleResult = validatePatternTitle(title);
  const hasSteps = draft.steps.length > 0;

  function save() {
    if (!titleResult.ok || !hasSteps) {
      return;
    }

    const patternId = onSave(titleResult.value);
    if (patternId !== undefined) {
      onSaved(patternId);
    }
  }

  return (
    <View className="gap-6">
      <View className="gap-3">
        <Text className="text-label text-ink">Title</Text>
        <CraftTextField
          accessibilityLabel="Pattern title"
          autoCapitalize="sentences"
          autoCorrect
          icon="format-title"
          onChangeText={setTitle}
          placeholder="Name your pattern"
          returnKeyType="done"
          testID="pattern-title-field"
          value={title}
        />
        {titleResult.ok ? null : (
          <Text className="text-label text-pinkStrong">
            {titleResult.message}
          </Text>
        )}
      </View>

      <CraftCard accent="blue">
        <Text accessibilityRole="header" className="text-heading text-ink">
          Where this came from
        </Text>
        <Text className="text-body text-ink">{draft.notes}</Text>
      </CraftCard>

      <View className="gap-3">
        <Text accessibilityRole="header" className="text-heading text-ink">
          Steps
        </Text>
        {hasSteps ? (
          draft.steps.map((instruction, index) => (
            <Text
              accessibilityLabel={stepAccessibilityLabel(
                index,
                draft.steps.length,
                instruction,
              )}
              className="text-body text-ink"
              key={`${index}-${instruction}`}
            >
              {instruction}
            </Text>
          ))
        ) : (
          <Text className="text-body text-ink">
            This guide has no steps yet. Add steps to the guide, then save it as
            a pattern.
          </Text>
        )}
      </View>

      <CraftPressable
        accessibilityHint="Creates a new pattern from this guide's steps"
        accessibilityLabel="Save pattern"
        className="items-center bg-tealStrong px-6 py-3"
        disabled={!titleResult.ok || !hasSteps}
        onPress={save}
      >
        <Text className="text-label text-surface">Save pattern</Text>
      </CraftPressable>
    </View>
  );
}
