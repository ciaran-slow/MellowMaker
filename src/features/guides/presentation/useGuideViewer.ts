import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  GuideStep,
  ImportedGuide,
} from '@/data/contracts/guideRepository';
// The current/next resolver is generic over `{ id, instruction }` and a
// completion snapshot, so the guide viewer reuses it directly rather than
// duplicating progress logic. Its historical `Pattern…` name is the only
// pattern-specific thing about it.
import {
  resolvePatternProgressView,
  type PatternProgressView,
} from '@/domain/patterns/patternProgress';
import {
  completionAnnouncement,
  reopenAnnouncement,
} from '@/features/guides/presentation/guideStepLabels';
import { useRepositories } from '@/ui/database/useRepositories';

export type GuideViewerState =
  | { readonly status: 'loading' }
  /** The id resolved to no row — a stale link or a just-deleted guide. */
  | { readonly status: 'missing' }
  | { readonly status: 'failed' }
  | {
      readonly status: 'ready';
      readonly guide: ImportedGuide;
      readonly view: PatternProgressView;
      /**
       * The saved step rows, in the same order as `view.steps`, so the working
       * view can render each step's optional timestamp, transcript, and note
       * (which the progress `StepView` does not carry).
       */
      readonly steps: readonly GuideStep[];
      /** Spoken by the screen's polite live region after a command. */
      readonly announcement: string;
    };

export interface GuideViewer {
  readonly state: GuideViewerState;
  retry(): void;
  /** Re-reads without flashing loading, so a focused viewer reflects edits. */
  refresh(): void;
  completeStep(stepId: string): void;
  reopenStep(stepId: string): void;
}

function completedStepIds(steps: readonly GuideStep[]): readonly string[] {
  return steps
    .filter((step) => step.completedAt !== undefined)
    .map((step) => step.id);
}

/**
 * Drives one interactive guide working view — the guide's home. It loads the
 * guide and its steps, derives the current/next step through the pure
 * `resolvePatternProgressView` (a guide has no persisted active pointer, so the
 * active id is always `undefined` and current is the first incomplete step), and
 * applies completion commands through a synchronous serialized runner that writes
 * then re-reads — never a read-modify-write and never a `!state` toggle. Because
 * `expo-sqlite` is synchronous over one shared connection and every completion
 * write is a single absolute statement keyed by step id, rapid or interleaved
 * taps commit in issue order and land on exactly the requested final state
 * (FR-GU-05). Persistence is independent of any animation.
 */
export function useGuideViewer(guideId: string): GuideViewer {
  const { guides } = useRepositories();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<GuideViewerState>({ status: 'loading' });
  // The last successfully loaded guide, read by commands rather than a React
  // closure, so a command always reflects committed state, not a stale render.
  const guideRef = useRef<ImportedGuide | undefined>(undefined);

  useEffect(() => {
    let current = true;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        const loaded = guides.getGuideWithSteps(guideId);
        if (loaded === undefined) {
          guideRef.current = undefined;
          setState({ status: 'missing' });

          return;
        }

        guideRef.current = loaded.guide;
        const view = resolvePatternProgressView(loaded.steps, {
          activeStepId: undefined,
          completedStepIds: completedStepIds(loaded.steps),
        });
        setState({
          status: 'ready',
          guide: loaded.guide,
          view,
          steps: loaded.steps,
          announcement: '',
        });
      } catch {
        setState({ status: 'failed' });
      }
    });

    return () => {
      current = false;
    };
  }, [attempt, guideId, guides]);

  // Applies one command, then re-reads the whole guide (completion lives on the
  // step rows, so the steps are re-read too — one bounded read) and recomputes
  // the view. A failure is screen-local and retryable.
  const runCommand = useCallback(
    (
      work: () => void,
      buildAnnouncement: (view: PatternProgressView, steps: readonly GuideStep[]) => string,
    ) => {
      if (guideRef.current === undefined) {
        return;
      }

      try {
        work();
        const reloaded = guides.getGuideWithSteps(guideId);
        if (reloaded === undefined) {
          guideRef.current = undefined;
          setState({ status: 'missing' });

          return;
        }

        guideRef.current = reloaded.guide;
        const view = resolvePatternProgressView(reloaded.steps, {
          activeStepId: undefined,
          completedStepIds: completedStepIds(reloaded.steps),
        });
        setState({
          status: 'ready',
          guide: reloaded.guide,
          view,
          steps: reloaded.steps,
          announcement: buildAnnouncement(view, reloaded.steps),
        });
      } catch {
        setState({ status: 'failed' });
      }
    },
    [guideId, guides],
  );

  const completeStep = useCallback(
    (stepId: string) => {
      runCommand(
        () => {
          guides.setGuideStepCompleted(stepId, true);
        },
        (view) => completionAnnouncement(view, stepId),
      );
    },
    [guides, runCommand],
  );

  const reopenStep = useCallback(
    (stepId: string) => {
      runCommand(
        () => {
          guides.setGuideStepCompleted(stepId, false);
        },
        (view) => reopenAnnouncement(view, stepId),
      );
    },
    [guides, runCommand],
  );

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }, []);

  const refresh = useCallback(() => {
    // Re-runs the load effect without touching the loading state, so a focused,
    // already-loaded viewer reflects edits made on the pushed editor in place.
    setAttempt((previous) => previous + 1);
  }, []);

  return { state, retry, refresh, completeStep, reopenStep };
}
