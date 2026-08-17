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
