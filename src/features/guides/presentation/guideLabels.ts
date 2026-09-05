import type { GuideSummary } from '@/data/contracts/guideRepository';

/**
 * One spoken name for a whole guide library row, so a screen reader announces the
 * guide and its creator as a single item rather than disconnected fragments. The
 * decorative thumbnail is hidden from assistive tech, so this label carries the
 * meaning.
 */
export function guideRowAccessibilityLabel(guide: GuideSummary): string {
  return guide.creator === undefined
    ? guide.title
    : `${guide.title}. By ${guide.creator}`;
}

/** Tells a maker how many guides they have without leaning on colour or an icon. */
export function guideCountLabel(count: number): string {
  return count === 1 ? '1 guide' : `${count} guides`;
}

/**
 * States, in words, how much of a guide the "Save as pattern" review will copy,
 * so the count is spoken by the review screen's live region rather than left to
 * a visual scan of the step list (issue #51).
 */
export function guideStepCopyLabel(count: number): string {
  if (count === 0) {
    return 'This guide has no steps to copy yet';
  }

  return count === 1
    ? '1 step will be copied into your new pattern'
    : `${count} steps will be copied into your new pattern`;
}
