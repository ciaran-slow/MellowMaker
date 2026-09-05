import { useCallback, useRef } from 'react';
import type { FlatList } from 'react-native';

import type { StepView } from '@/domain/patterns/patternProgress';

/**
 * The restore is confined to the startup window: `onContentSizeChange` fires for
 * the whole life of the list — including on a completion that changes a row's
 * height — so an unbounded retry could land a maker who had long since scrolled
 * elsewhere. Five is comfortably above the two fills a 24-row list needs
 * (`initialNumToRender` 10 + `maxToRenderPerBatch` 10) and it bounds the
 * behaviour to open.
 */
export const MAX_RESTORE_ATTEMPTS = 5;

export interface PatternPositionRestore {
  /**
   * Callback ref for the step list's `ref` — the `registerPlayer` convention
   * from `useGuidePlayer`. React calls it with the list's imperative handle on
   * mount and with `null` on unmount, so the policy owns a list handle without
   * handing a raw ref object out to a render (`react-hooks/refs` rejects
   * reading one there, and the object would be dead weight in JSX besides).
   */
  registerList(instance: FlatList<StepView> | null): void;
  /** Wire to the step list's `onContentSizeChange`. */
  onContentSizeChange(): void;
  /** Wire to the step list's `onScrollToIndexFailed`. Scrolls nothing, ever. */
  onScrollToIndexFailed(): void;
}

/**
 * Opens the pattern viewer **at** the maker's current step (issue #63, FR-PV-05),
 * restoring the visual position that issue #56 gave up when the chrome moved
 * into the list's `ListHeaderComponent`.
 *
 * It scrolls **after layout** rather than through `initialScrollIndex`, and that
 * is the whole point: `VirtualizedList` takes `getItemLayout`'s offsets verbatim
 * and tracks the header's height separately, never adding it, whereas a cell's
 * *measured* offset comes from its own `onLayout` relative to the content
 * container — which contains the header cell — so the header is already in it
 * (`@react-native/virtualized-lists/Lists/ListMetricsAggregator.js`). With no
 * `getItemLayout` on the list, `scrollToIndex` can only reach a real scroll
 * offset for a **measured** cell; an unmeasured index calls
 * `onScrollToIndexFailed` and returns without scrolling at all. So this
 * mechanism can be degraded (the maker stays at the top) but never wrong.
 *
 * `onScrollToIndexFailed` therefore **ignores its payload and scrolls nothing**:
 * that payload offers an average row length to multiply by the index, which is
 * exactly the header-unaware arithmetic #56 removed. An unmeasured target simply
 * waits for the next content-size change, which the list itself provokes —
 * `_onContentSizeChange` ends in `_scheduleCellsToRenderUpdate()`, so each fire
 * both reports fresh metrics and triggers the next fill batch. (The source guard
 * in `PatternViewerScreen.test.tsx` pins that none of the payload's field names
 * nor an offset-scroll call appears in this file at all; keep it that way.)
 *
 * The restore is **once per mount**: as soon as an attempt does not fail, or the
 * cap is reached, or there is nothing to restore to, it settles. A completion tap
 * or a counter tap can therefore never yank a maker away from what they are
 * reading, and returning to a still-mounted viewer (from the editor) keeps the
 * native scroll position rather than re-snapping. A genuine reopen from the
 * library is a fresh mount, so it restores again — to wherever the maker now is.
 *
 * All state lives in refs, so the policy never causes a render of its own.
 */
export function usePatternPositionRestore(
  currentStepIndex: number | undefined,
): PatternPositionRestore {
  const listRef = useRef<FlatList<StepView> | null>(null);
  /** The restore is finished for this mount; nothing may scroll again. */
  const settledRef = useRef(false);
  const attemptsRef = useRef(0);
  const lastAttemptFailedRef = useRef(false);

  const registerList = useCallback(
    (instance: FlatList<StepView> | null): void => {
      listRef.current = instance;
    },
    [],
  );

  const onScrollToIndexFailed = useCallback((): void => {
    // Deliberately parameterless: the failure payload is header-unaware, so it
    // is not even in scope to be turned into an offset.
    lastAttemptFailedRef.current = true;
  }, []);

  const onContentSizeChange = useCallback((): void => {
    if (settledRef.current) {
      return;
    }

    // One guard for all three "no work" cases: no current step at all
    // (`findIndex` → -1, i.e. an empty or fully complete pattern), and a current
    // step that is already the first row, where scrolling to index 0 would snap
    // a maker who had flicked ahead back to the top.
    if (currentStepIndex === undefined || currentStepIndex <= 0) {
      settledRef.current = true;
      return;
    }

    if (attemptsRef.current >= MAX_RESTORE_ATTEMPTS) {
      settledRef.current = true;
      return;
    }

    attemptsRef.current += 1;
    lastAttemptFailedRef.current = false;
    listRef.current?.scrollToIndex({
      animated: false,
      index: currentStepIndex,
      viewPosition: 0,
    });
    // `onScrollToIndexFailed` is invoked synchronously from inside
    // `scrollToIndex`, so by here the flag already tells us whether the target
    // was measured. A non-failing attempt landed, and settles the restore.
    if (!lastAttemptFailedRef.current) {
      settledRef.current = true;
    }
  }, [currentStepIndex]);

  return { onContentSizeChange, onScrollToIndexFailed, registerList };
}
