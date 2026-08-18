/**
 * Pure validation and parsing for the guide-step editor. Mirrors
 * `guideDraft.ts` / `patternDraft.ts`: presentation trims, validates, and parses
 * maker input here before it reaches a repository, so the data layer's "text
 * arrives already trimmed" invariant holds and the UI maps a field-error result
 * to accessible text.
 *
 * This module imports nothing from React, Expo, or any other layer (lint
 * enforces the boundary) so it stays trivially testable offline and reusable.
 */

import type { FieldResult } from '@/domain/guides/guideDraft';

/** A required step instruction: trimmed, non-empty, and never whitespace-only. */
export function validateGuideStepInstruction(raw: string): FieldResult {
  const value = raw.trim();
  if (value === '') {
    return { ok: false, message: 'Add an instruction for this step.' };
  }

  return { ok: true, value };
}

export type TimestampResult =
  /** `value` is `undefined` when the field was left blank (an optional field). */
  | { readonly ok: true; readonly value: number | undefined }
  | { readonly ok: false; readonly message: string };

const TIMESTAMP_ERROR = 'Enter a time like 0:45 or 1:05:20.';
const DIGITS = /^\d+$/;

/**
 * Parses a maker-entered video timestamp into whole milliseconds. Blank is a
 * valid optional value (`undefined`). Accepts bare seconds (`75`), `M:SS`,
 * `MM:SS`, `H:MM:SS`, and `HH:MM:SS`; the minute and second segments of any
 * colon-separated form are constrained to 0–59, and a bare-seconds form has no
 * upper bound (`75` is 75 seconds). Returns milliseconds so it matches the
 * `guide_step.video_offset_ms` column directly.
 */
export function parseStepTimestamp(raw: string): TimestampResult {
  const value = raw.trim();
  if (value === '') {
    return { ok: true, value: undefined };
  }

  const parts = value.split(':');
  if (parts.some((part) => !DIGITS.test(part))) {
    return { ok: false, message: TIMESTAMP_ERROR };
  }

  const numbers = parts.map((part) => Number(part));

  if (numbers.length === 1) {
    const [seconds] = numbers as [number];

    return { ok: true, value: seconds * 1000 };
  }

  if (numbers.length === 2) {
    const [minutes, seconds] = numbers as [number, number];
    if (seconds > 59) {
      return { ok: false, message: TIMESTAMP_ERROR };
    }

    return { ok: true, value: (minutes * 60 + seconds) * 1000 };
  }

  if (numbers.length === 3) {
    const [hours, minutes, seconds] = numbers as [number, number, number];
    if (minutes > 59 || seconds > 59) {
      return { ok: false, message: TIMESTAMP_ERROR };
    }

    return { ok: true, value: ((hours * 60 + minutes) * 60 + seconds) * 1000 };
  }

  return { ok: false, message: TIMESTAMP_ERROR };
}

/**
 * Renders a stored millisecond offset as a display badge, the inverse of
 * `parseStepTimestamp`: `42000 → '0:42'`, `65000 → '1:05'`, `3600000 →
 * '1:00:00'`. The hours segment appears only when the offset is at least an
 * hour.
 */
export function formatStepTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value: number) => value.toString().padStart(2, '0');

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** Optional transcript excerpt: trimmed, with blank collapsing to `undefined` (SQL `NULL`). */
export function normalizeTranscriptExcerpt(raw: string): string | undefined {
  const value = raw.trim();

  return value === '' ? undefined : value;
}

/** Optional maker note: trimmed, with blank collapsing to `undefined` (SQL `NULL`). */
export function normalizeMakerNote(raw: string): string | undefined {
  const value = raw.trim();

  return value === '' ? undefined : value;
}
