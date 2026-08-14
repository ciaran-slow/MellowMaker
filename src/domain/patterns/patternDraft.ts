/**
 * Pure validation for the pattern editor. These functions own the trim/validate
 * contract described in the architecture's controlled-form model: presentation
 * trims and validates maker input here before it reaches a repository, so the
 * data layer's "text arrives already trimmed" invariant holds and the UI maps a
 * field-error result to accessible text.
 *
 * This module imports nothing from React, Expo, or any other layer (lint
 * enforces the boundary) so it stays trivially testable and reusable.
 */

export type FieldResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

/** A required title: trimmed, non-empty, and never whitespace-only. */
export function validatePatternTitle(raw: string): FieldResult {
  const value = raw.trim();
  if (value === '') {
    return { ok: false, message: 'Give your pattern a name to save it.' };
  }

  return { ok: true, value };
}

/** A required step instruction: trimmed, non-empty, and never whitespace-only. */
export function validateStepInstruction(raw: string): FieldResult {
  const value = raw.trim();
  if (value === '') {
    return { ok: false, message: 'Write what this step does before adding it.' };
  }

  return { ok: true, value };
}

/** Optional notes: trimmed, with blank collapsing to `undefined` (SQL `NULL`). */
export function normalizePatternNotes(raw: string): string | undefined {
  const value = raw.trim();

  return value === '' ? undefined : value;
}
