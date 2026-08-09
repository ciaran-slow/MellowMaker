import type {
  StitchDifficulty,
  StitchSummary,
} from '@/data/contracts/stitchRepository';

/** Difficulty is carried by words, never by colour alone. */
export const DIFFICULTY_LABEL: Record<StitchDifficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/**
 * One spoken name for a whole result row, so a screen reader announces the
 * stitch once instead of reading four disconnected fragments.
 */
export function stitchRowAccessibilityLabel(stitch: StitchSummary): string {
  return `${stitch.name}, ${stitch.abbreviation}, ${DIFFICULTY_LABEL[stitch.difficulty]}`;
}

/**
 * Tells a maker how many stitches they are looking at and whether the list is
 * filtered, which is the only cue that a search is still applied after the
 * keyboard closes.
 */
export function resultSummaryLabel(count: number, isSearch: boolean): string {
  if (isSearch) {
    return count === 1 ? '1 match' : `${count} matches`;
  }

  return count === 1 ? '1 stitch' : `${count} stitches`;
}
