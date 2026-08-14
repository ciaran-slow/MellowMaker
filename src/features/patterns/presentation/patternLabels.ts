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
