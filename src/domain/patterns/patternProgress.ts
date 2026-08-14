/**
 * Pure current-step resolution for the interactive pattern viewer. Given the
 * pattern's ordered steps and a progress snapshot, this is the single definition
 * of "which step is current" and "what is each step's status", so presentation
 * and tests cannot disagree about progress.
 *
 * This module imports nothing from React, Expo, or any other layer (lint
 * enforces the boundary) so it stays trivially testable and reusable.
 */

export type StepStatus = 'completed' | 'current' | 'todo';

export interface StepView {
  readonly id: string;
  /** 0-based position in the ordered list. */
  readonly index: number;
  readonly instruction: string;
  readonly status: StepStatus;
}

export interface PatternProgressView {
  readonly steps: readonly StepView[];
  /** `undefined` only when every step is complete or there are no steps. */
  readonly currentStepId: string | undefined;
  readonly completedCount: number;
  readonly totalCount: number;
  /** `totalCount > 0 && completedCount === totalCount`. */
  readonly allComplete: boolean;
}

/**
 * Resolves each step's status and the single current step. The current step is
 * `activeStepId` when it names an existing incomplete step, otherwise the first
 * incomplete step in list order, otherwise `undefined` (every step complete or
 * no steps). Exactly one step is ever marked `current`.
 */
export function resolvePatternProgressView(
  steps: readonly { readonly id: string; readonly instruction: string }[],
  progress: {
    readonly activeStepId: string | undefined;
    readonly completedStepIds: readonly string[];
  },
): PatternProgressView {
  const completed = new Set(progress.completedStepIds);
  const currentStepId = resolveCurrentStepId(steps, progress.activeStepId, completed);

  const stepViews = steps.map((step, index) => ({
    id: step.id,
    index,
    instruction: step.instruction,
    status: completed.has(step.id)
      ? ('completed' as const)
      : step.id === currentStepId
        ? ('current' as const)
        : ('todo' as const),
  }));

  const totalCount = steps.length;
  const completedCount = stepViews.filter(
    (step) => step.status === 'completed',
  ).length;

  return {
    steps: stepViews,
    currentStepId,
    completedCount,
    totalCount,
    allComplete: totalCount > 0 && completedCount === totalCount,
  };
}

/**
 * The first incomplete step in list order, or `undefined` when every step is
 * complete (or there are no steps). Used to advance the active position when the
 * current step is completed.
 */
export function nextIncompleteStepId(
  steps: readonly { readonly id: string }[],
  completedStepIds: readonly string[],
): string | undefined {
  const completed = new Set(completedStepIds);

  return steps.find((step) => !completed.has(step.id))?.id;
}

function resolveCurrentStepId(
  steps: readonly { readonly id: string }[],
  activeStepId: string | undefined,
  completed: ReadonlySet<string>,
): string | undefined {
  if (
    activeStepId !== undefined &&
    !completed.has(activeStepId) &&
    steps.some((step) => step.id === activeStepId)
  ) {
    return activeStepId;
  }

  return steps.find((step) => !completed.has(step.id))?.id;
}
