/**
 * Pure validation for the guide import form. Mirrors `patternDraft.ts`:
 * presentation trims and validates maker input here before it reaches a
 * repository, so the data layer's "text arrives already trimmed" invariant holds
 * and the UI maps a field-error result to accessible text.
 *
 * This module imports nothing from React, Expo, or any other layer (lint
 * enforces the boundary) so it stays trivially testable and reusable by #10.
 */

export type FieldResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

/** A required guide title: trimmed, non-empty, and never whitespace-only. */
export function validateGuideTitle(raw: string): FieldResult {
  const value = raw.trim();
  if (value === '') {
    return { ok: false, message: 'Give this guide a title to save it.' };
  }

  return { ok: true, value };
}

/** Optional creator: trimmed, with blank collapsing to `undefined` (SQL `NULL`). */
export function normalizeGuideCreator(raw: string): string | undefined {
  const value = raw.trim();

  return value === '' ? undefined : value;
}
