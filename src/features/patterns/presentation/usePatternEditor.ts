import { useCallback, useEffect, useState } from 'react';

import type {
  CreatePatternInput,
  PatternStep,
  PatternSummary,
} from '@/data/contracts/patternRepository';
import { useRepositories } from '@/ui/database/useRepositories';

/** Editor detail edit: `notes` may be explicitly cleared to `undefined`. */
export interface PatternDetailsDraft {
  readonly title: string;
  readonly notes: string | undefined;
}

export type PatternEditorState =
  /** No id yet: the maker is composing a brand-new pattern in memory. */
  | { readonly status: 'create' }
  | { readonly status: 'loading' }
  /** The id resolved to no row — a stale link or a just-deleted pattern. */
  | { readonly status: 'missing' }
  | { readonly status: 'failed' }
  | {
      readonly status: 'ready';
      readonly pattern: PatternSummary;
      readonly steps: readonly PatternStep[];
    };

export interface PatternEditor {
  readonly state: PatternEditorState;
  retry(): void;
  /** Commits a new pattern and its ordered steps in one transaction. */
  createDraftPattern(input: CreatePatternInput): string | undefined;
  saveDetails(input: PatternDetailsDraft): void;
  addStep(instruction: string): void;
  editStep(stepId: string, instruction: string): void;
  deleteStep(stepId: string): void;
  moveStepUp(stepId: string): void;
  moveStepDown(stepId: string): void;
  deletePattern(): void;
}

/**
 * Drives one pattern editor. With no `patternId` it starts in `create` mode and
 * only exposes `createDraftPattern`; with an id it loads the persisted pattern
 * (mirroring `useStitchDetail`'s `loading | missing | failed | ready`) and every
 * mutation writes through the repository and re-reads, so SQLite stays the one
 * authoritative copy. A post-ready read or write failure is screen-local and
 * retryable rather than a crash.
 */
export function usePatternEditor(patternId?: string): PatternEditor {
  const { patterns } = useRepositories();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PatternEditorState>(
    patternId === undefined ? { status: 'create' } : { status: 'loading' },
  );

  const applyLoaded = useCallback(
    (id: string) => {
      const loaded = patterns.getPatternWithSteps(id);
      setState(
        loaded === undefined
          ? { status: 'missing' }
          : {
              status: 'ready',
              pattern: loaded.pattern,
              steps: loaded.steps,
            },
      );
    },
    [patterns],
  );

  useEffect(() => {
    if (patternId === undefined) {
      return;
    }

    let current = true;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        applyLoaded(patternId);
      } catch {
        setState({ status: 'failed' });
      }
    });

    return () => {
      current = false;
    };
  }, [attempt, patternId, applyLoaded]);

  const mutate = useCallback(
    (work: () => void) => {
      if (patternId === undefined) {
        return;
      }

      try {
        work();
        applyLoaded(patternId);
      } catch {
        setState({ status: 'failed' });
      }
    },
    [patternId, applyLoaded],
  );

  const createDraftPattern = useCallback(
    (input: CreatePatternInput): string | undefined => {
      try {
        return patterns.createPattern(input).pattern.id;
      } catch {
        setState({ status: 'failed' });

        return undefined;
      }
    },
    [patterns],
  );

  const saveDetails = useCallback(
    (input: PatternDetailsDraft) => {
      if (patternId === undefined) {
        return;
      }

      mutate(() => {
        patterns.updatePattern(
          input.notes === undefined
            ? { id: patternId, title: input.title }
            : { id: patternId, title: input.title, notes: input.notes },
        );
      });
    },
    [patternId, patterns, mutate],
  );

  const addStep = useCallback(
    (instruction: string) => {
      if (patternId === undefined) {
        return;
      }

      mutate(() => {
        patterns.addStep(patternId, instruction);
      });
    },
    [patternId, patterns, mutate],
  );

  const editStep = useCallback(
    (stepId: string, instruction: string) => {
      mutate(() => {
        patterns.editStep(stepId, instruction);
      });
    },
    [patterns, mutate],
  );

  const deleteStep = useCallback(
    (stepId: string) => {
      mutate(() => {
        patterns.deleteStep(stepId);
      });
    },
    [patterns, mutate],
  );

  const moveStep = useCallback(
    (stepId: string, direction: -1 | 1) => {
      if (state.status !== 'ready' || patternId === undefined) {
        return;
      }

      const order = state.steps.map((step) => step.id);
      const from = order.indexOf(stepId);
      const to = from + direction;
      if (from === -1 || to < 0 || to >= order.length) {
        return;
      }

      const reordered = [...order];
      const moved = reordered[from];
      const displaced = reordered[to];
      if (moved === undefined || displaced === undefined) {
        return;
      }
      reordered[from] = displaced;
      reordered[to] = moved;

      mutate(() => {
        patterns.reorderSteps(patternId, reordered);
      });
    },
    [state, patternId, patterns, mutate],
  );

  const moveStepUp = useCallback(
    (stepId: string) => {
      moveStep(stepId, -1);
    },
    [moveStep],
  );

  const moveStepDown = useCallback(
    (stepId: string) => {
      moveStep(stepId, 1);
    },
    [moveStep],
  );

  const deletePattern = useCallback(() => {
    if (patternId === undefined) {
      return;
    }

    patterns.deletePattern(patternId);
  }, [patternId, patterns]);

  const retry = useCallback(() => {
    if (patternId === undefined) {
      return;
    }

    setState({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }, [patternId]);

  return {
    state,
    retry,
    createDraftPattern,
    saveDetails,
    addStep,
    editStep,
    deleteStep,
    moveStepUp,
    moveStepDown,
    deletePattern,
  };
}
