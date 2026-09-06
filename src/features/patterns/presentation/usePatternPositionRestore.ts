import { useCallback, useEffect, useRef } from 'react';
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
  /**
   * Wire to the step list's `onContentSizeChange`. It schedules the attempt one
   * task later rather than making it inline — see the pre-order note below.
   */
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
 * **Each attempt is deferred by one task, and that is load-bearing.**
 * `onContentSizeChange` is not a native content-size event: it is the JS
 * `onLayout` of the ScrollView's *content container*
 * (`ScrollView.js` `_handleContentOnLayout`), and Fabric emits `onLayout` in
 * **pre-order** — `YogaLayoutableShadowNode::layout` pushes a child onto
 * `affectedNodes` *before* recursing into that child, `ShadowTree::emitLayoutEvents`
 * emits in that vector's order, and `BaseViewEventEmitter` preserves ordering.
 * The content container is the parent of every cell, so in any commit its
 * `onLayout` reaches JS **before** the `onLayout` of the cells that commit laid
 * out. Attempting inline would therefore always read the *previous* batch's
 * metrics: a pattern of ten steps or fewer (every bundled starter) would produce
 * one fire, before any cell was measured, and never restore at all, and a current
 * step in the final fill batch would never restore either, because no later
 * content-size change arrives to retry on. Deferring to a macrotask fixes both
 * without a second trigger: the whole commit's layout events are moved off the
 * event queue and dispatched in a single JS entry
 * (`EventQueue::flushEvents`), JavaScript is single-threaded, so a task scheduled
 * from the first of them cannot run until the last of them has returned — by
 * which time this batch's cells are measured.
 *
 * The pending task is cleared on unmount, and a fresh fire replaces a still
 * pending one, so at most one attempt is ever in flight.
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
  /** The one deferred attempt in flight, if any; cleared on unmount. */
  const pendingAttemptRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

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

  const attemptRestore = useCallback((): void => {
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

  const onContentSizeChange = useCallback((): void => {
    if (settledRef.current) {
      return;
    }

    // The cells this commit laid out are measured only AFTER this handler
    // returns (see the pre-order note above), so the attempt waits one task.
    // A fire while one is still pending replaces it rather than queueing a
    // second, so a burst of commits still costs one attempt.
    if (pendingAttemptRef.current !== undefined) {
      clearTimeout(pendingAttemptRef.current);
    }
    pendingAttemptRef.current = setTimeout(() => {
      pendingAttemptRef.current = undefined;
      attemptRestore();
    }, 0);
  }, [attemptRestore]);

  useEffect(
    () => (): void => {
      if (pendingAttemptRef.current !== undefined) {
        clearTimeout(pendingAttemptRef.current);
        pendingAttemptRef.current = undefined;
      }
    },
    [],
  );

  return { onContentSizeChange, onScrollToIndexFailed, registerList };
}
