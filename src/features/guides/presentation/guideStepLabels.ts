import type {
  PatternProgressView,
  StepStatus,
} from '@/domain/patterns/patternProgress';

import { formatStepTimestamp } from '@/domain/guides/guideStepDraft';

/**
 * Guide-specific accessibility strings. Kept separate from `patternLabels.ts` so
 * the guide wording (timestamps, "Guide complete") stays guide-specific even
 * though guides reuse the pattern progress resolver. A screen reader hears a
 * step's ordinal, its instruction, its optional timestamp, and — in the working
 * view — its progress status, so meaning never rests on colour or shape alone.
 */

function timestampClause(videoOffsetMs: number | undefined): string {
  return videoOffsetMs === undefined
    ? ''
    : ` at ${formatStepTimestamp(videoOffsetMs)}`;
}

/** The spoken name for a timestamp badge, e.g. `"Video timestamp 0:42"`. */
export function timestampBadgeLabel(videoOffsetMs: number): string {
  return `Video timestamp ${formatStepTimestamp(videoOffsetMs)}`;
}

/** Announces an editable guide step by its place in the list and its timestamp. */
export function editorStepAccessibilityLabel(
  index: number,
  total: number,
  instruction: string,
  videoOffsetMs: number | undefined,
): string {
  return `Step ${index + 1} of ${total}${timestampClause(videoOffsetMs)}: ${instruction}`;
}

/**
 * Announces a working-view step with its ordinal, timestamp, and progress status
 * in words, so a screen reader user hears whether a step is done, current, or
 * still to do without relying on colour or shape.
 */
export function viewerStepAccessibilityLabel(
  index: number,
  total: number,
  instruction: string,
  status: StepStatus,
  videoOffsetMs: number | undefined,
): string {
  const place = `Step ${index + 1} of ${total}${timestampClause(videoOffsetMs)}`;
  switch (status) {
    case 'completed':
      return `${place}, completed: ${instruction}`;
    case 'current':
      return `${place}, current step: ${instruction}`;
    case 'todo':
      return `${place}, to do: ${instruction}`;
  }
}

/** States guide progress in words for a live region, never colour alone. */
export function progressSummaryLabel(completed: number, total: number): string {
  return `${completed} of ${total} steps done`;
}

function stepNumber(view: PatternProgressView, stepId: string): number {
  const index = view.steps.findIndex((step) => step.id === stepId);

  return index === -1 ? 0 : index + 1;
}

/** Spoken after a completion: what completed and where the maker is now. */
export function completionAnnouncement(
  view: PatternProgressView,
  stepId: string,
): string {
  const completed = `Step ${stepNumber(view, stepId)} completed.`;
  if (view.allComplete) {
    return `${completed} Guide complete.`;
  }
  if (view.currentStepId === undefined) {
    return completed;
  }

  return `${completed} Now on step ${stepNumber(view, view.currentStepId)}.`;
}

/** Spoken after a step is reopened. */
export function reopenAnnouncement(
  view: PatternProgressView,
  stepId: string,
): string {
  return `Step ${stepNumber(view, stepId)} reopened.`;
}
