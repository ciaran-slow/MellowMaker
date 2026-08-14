import type { StepStatus } from '@/domain/patterns/patternProgress';

import type { PatternSummary } from '@/data/contracts/patternRepository';

/**
 * One spoken name for a whole library row, so a screen reader announces the
 * pattern and its notes as a single item instead of disconnected fragments.
 */
export function patternRowAccessibilityLabel(pattern: PatternSummary): string {
  return pattern.notes === undefined
    ? pattern.title
    : `${pattern.title}. ${pattern.notes}`;
}

/**
 * Announces an ordered step by its place in the list, so a screen reader user
 * hears "Step 2 of 5" rather than an unmoored instruction.
 */
export function stepAccessibilityLabel(
  index: number,
  total: number,
  instruction: string,
): string {
  return `Step ${index + 1} of ${total}: ${instruction}`;
}

/** Tells a maker how many patterns they have without leaning on colour or an icon. */
export function libraryCountLabel(count: number): string {
  return count === 1 ? '1 pattern' : `${count} patterns`;
}

/**
 * Announces a viewer step with its ordinal *and* its progress status in words,
 * so a screen reader user hears whether a step is done, current, or still to do
 * without relying on colour or shape alone.
 */
export function viewerStepAccessibilityLabel(
  index: number,
  total: number,
  instruction: string,
  status: StepStatus,
): string {
  const place = `Step ${index + 1} of ${total}`;
  switch (status) {
    case 'completed':
      return `${place}, completed: ${instruction}`;
    case 'current':
      return `${place}, current step: ${instruction}`;
    case 'todo':
      return `${place}, to do: ${instruction}`;
  }
}

/** States pattern progress in words for a live region, never colour alone. */
export function progressSummaryLabel(completed: number, total: number): string {
  return `${completed} of ${total} steps done`;
}
