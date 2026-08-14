import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  PatternStep,
  PatternSummary,
} from '@/data/contracts/patternRepository';
import {
  nextIncompleteStepId,
  resolvePatternProgressView,
  type PatternProgressView,
} from '@/domain/patterns/patternProgress';
import { useRepositories } from '@/ui/database/useRepositories';

export type PatternViewerState =
  | { readonly status: 'loading' }
  /** The id resolved to no row — a stale link or a just-deleted pattern. */
  | { readonly status: 'missing' }
  | { readonly status: 'failed' }
  | {
      readonly status: 'ready';
      readonly pattern: PatternSummary;
      readonly view: PatternProgressView;
      /** Spoken by the screen's polite live region after a command. */
      readonly announcement: string;
    };

export interface PatternViewer {
  readonly state: PatternViewerState;
  retry(): void;
  /** Re-reads without flashing loading, so a focused viewer reflects edits. */
  refresh(): void;
  completeStep(stepId: string): void;
  reopenStep(stepId: string): void;
  selectStep(stepId: string): void;
}

interface LoadedPattern {
  readonly pattern: PatternSummary;
  readonly steps: readonly PatternStep[];
}

/**
 * Drives one interactive pattern viewer. It loads the pattern and its progress,
 * computes the current/next step through the pure `resolvePatternProgressView`,
 * and applies completion commands through a synchronous serialized runner that
 * writes then re-reads — never a read-modify-write of an in-memory value and
 * never a `!state` toggle. Because `expo-sqlite` is synchronous over one shared
 * connection and every completion write is a single idempotent statement keyed
 * by `step_id` taking an absolute target, rapid or interleaved taps commit in
 * issue order and land on exactly the requested final state (FR-PV-06, NFR-08).
 * Persistence is independent of any animation.
 */
export function usePatternViewer(patternId: string): PatternViewer {
  const { patterns, progress } = useRepositories();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PatternViewerState>({ status: 'loading' });
  // The last successfully loaded pattern and its steps. Commands read it here
  // rather than from a React closure, so a target is always computed from the
  // committed pattern, not a stale render.
  const loadedRef = useRef<LoadedPattern | undefined>(undefined);

  useEffect(() => {
    let current = true;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        const loaded = patterns.getPatternWithSteps(patternId);
        if (loaded === undefined) {
          loadedRef.current = undefined;
          setState({ status: 'missing' });

          return;
        }

        loadedRef.current = { pattern: loaded.pattern, steps: loaded.steps };
        const view = resolvePatternProgressView(
          loaded.steps,
          progress.getProgress(patternId),
        );
        setState({
          status: 'ready',
          pattern: loaded.pattern,
          view,
          announcement: '',
        });
      } catch {
        setState({ status: 'failed' });
      }
    });

    return () => {
      current = false;
    };
  }, [attempt, patternId, patterns, progress]);

  // Applies one command, then re-reads progress and recomputes the view. The
  // steps are stable in the viewer, so only progress is re-read. A failure is
  // screen-local and retryable, mirroring the editor's `mutate`.
  const runCommand = useCallback(
    (
      work: () => void,
      buildAnnouncement: (view: PatternProgressView) => string,
    ) => {
      const loaded = loadedRef.current;
      if (loaded === undefined) {
        return;
      }

      try {
        work();
        const view = resolvePatternProgressView(
          loaded.steps,
          progress.getProgress(patternId),
        );
        setState({
          status: 'ready',
          pattern: loaded.pattern,
          view,
          announcement: buildAnnouncement(view),
        });
      } catch {
        setState({ status: 'failed' });
      }
    },
    [patternId, progress],
  );

  const completeStep = useCallback(
    (stepId: string) => {
      const loaded = loadedRef.current;
      if (loaded === undefined) {
        return;
      }

      runCommand(() => {
        // Whether this step is the current one is decided from committed state,
        // so completing an out-of-order step never yanks the maker's position.
        const currentBefore = resolvePatternProgressView(
          loaded.steps,
          progress.getProgress(patternId),
        ).currentStepId;

        progress.setStepCompleted(stepId, true);

        if (stepId === currentBefore) {
          const next = nextIncompleteStepId(
            loaded.steps,
            progress.getProgress(patternId).completedStepIds,
          );
          progress.setActiveStep(patternId, next ?? null);
        }
      }, (view) => completionAnnouncement(view, stepId));
    },
    [patternId, progress, runCommand],
  );

  const reopenStep = useCallback(
    (stepId: string) => {
      runCommand(
        () => {
          progress.setStepCompleted(stepId, false);
        },
        (view) => stepActionAnnouncement(view, stepId, 'reopened'),
      );
    },
    [progress, runCommand],
  );

  const selectStep = useCallback(
    (stepId: string) => {
      runCommand(
        () => {
          progress.setActiveStep(patternId, stepId);
        },
        (view) => stepActionAnnouncement(view, stepId, 'selected'),
      );
    },
    [patternId, progress, runCommand],
  );

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }, []);

  const refresh = useCallback(() => {
    // Re-runs the load effect without touching the loading state, so a focused,
    // already-loaded viewer refreshes edits and re-restores position in place.
    setAttempt((previous) => previous + 1);
  }, []);

  return { state, retry, refresh, completeStep, reopenStep, selectStep };
}

function stepNumber(view: PatternProgressView, stepId: string): number {
  const index = view.steps.findIndex((step) => step.id === stepId);

  return index === -1 ? 0 : index + 1;
}

function completionAnnouncement(
  view: PatternProgressView,
  stepId: string,
): string {
  const completed = `Step ${stepNumber(view, stepId)} completed.`;
  if (view.allComplete) {
    return `${completed} Pattern complete.`;
  }
  if (view.currentStepId === undefined) {
    return completed;
  }

  return `${completed} Now on step ${stepNumber(view, view.currentStepId)}.`;
}

function stepActionAnnouncement(
  view: PatternProgressView,
  stepId: string,
  action: 'reopened' | 'selected',
): string {
  const number = stepNumber(view, stepId);

  return action === 'reopened'
    ? `Step ${number} reopened.`
    : `Now on step ${number}.`;
}
