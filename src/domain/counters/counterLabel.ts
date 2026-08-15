/**
 * The single definition of a counter's maker label, shared by the repository
 * default and the presentation rename so they cannot disagree. A counter always
 * carries a non-empty label; a blank or whitespace-only rename falls back to the
 * default rather than storing an empty string.
 *
 * This module imports nothing from React, Expo, or any other layer (lint
 * enforces the boundary) so it stays trivially testable and reusable — the same
 * shape as `patternDraft.ts` and `stitchQuery.ts`.
 */

/** The default label for a maker-labelled counter (PRD0 decision 3). */
export const DEFAULT_COUNTER_LABEL = 'Rows';

/** A counter label never exceeds this many characters once normalized. */
export const MAX_COUNTER_LABEL_LENGTH = 40;

/**
 * Normalizes a raw rename draft: trims surrounding whitespace, falls back to the
 * default when the result is empty, and caps the length so a pathological paste
 * cannot store an unbounded label.
 */
export function normalizeCounterLabel(raw: string): string {
  const value = raw.trim();

  return value === ''
    ? DEFAULT_COUNTER_LABEL
    : value.slice(0, MAX_COUNTER_LABEL_LENGTH);
}
