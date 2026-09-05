import { canonicalWatchUrl } from '@/domain/guides/youtubeUrl';

/**
 * The guide→pattern snapshot (architecture §9.3, issue #51).
 *
 * This module owns the whole lossiness contract in one pure, testable place. The
 * conversion is **lossy by construction, deliberately**: `pattern_step` is
 * `(id, pattern_id, position, instruction, created_at, updated_at)` — no
 * `video_offset_ms`, no `transcript_excerpt`, no per-step `note`, no `origin` —
 * and `CreatePatternInput.steps` is a bare `readonly string[]`. Timestamps,
 * transcript excerpts, per-step notes, step origin, and completion are dropped
 * here and nowhere else, and the source is recorded **once** in the pattern's
 * notes as the canonical watch URL.
 *
 * It imports only the sibling URL grammar, so the domain lint boundary and the
 * `offlineColdStart` walk guard both hold by default.
 */

export interface GuideSnapshotSource {
  /** Canonical YouTube identity; the source line is derived from this. */
  readonly videoId: string;
  readonly title: string;
  readonly notes: string | undefined;
  /**
   * Guide steps in position order; only the instruction crosses over. The
   * parameter is structural (`{ instruction }`) rather than `GuideStep` on
   * purpose: the domain layer may not name a `@/data/*` type, and a
   * `readonly GuideStep[]` satisfies this shape at the call site anyway.
   */
  readonly steps: readonly { readonly instruction: string }[];
}

export interface PatternSnapshotDraft {
  readonly title: string;
  /** Always present: line one records the source, so provenance is never lost. */
  readonly notes: string;
  readonly steps: readonly string[];
}

/** The metacharacter-free prefix the smoke flow selects the notes line on. */
export const SNAPSHOT_SOURCE_PREFIX = 'Saved from YouTube: ';

/**
 * Builds the pattern draft a guide converts into. Order is the caller's — the
 * repository already reads steps `ORDER BY position ASC, id ASC` — and this
 * function must never re-sort them.
 *
 * The source line is derived from `videoId`, not copied from the guide's stored
 * `sourceUrl`: `video_id` is the unique canonical identity (§9.1) while
 * `source_url` is a stored string with no canonical-form constraint, so deriving
 * guarantees the recorded link is the canonical watch URL §9.3 specifies even
 * for a guide row whose `source_url` was written in some other supported form.
 * The guide's own maker-authored notes follow after a blank line when it has
 * any: `pattern.notes` is the one field that can hold them, and dropping maker
 * text when a home exists would be a data-loss defect.
 */
export function guidePatternSnapshot(
  source: GuideSnapshotSource,
): PatternSnapshotDraft {
  const sourceLine = `${SNAPSHOT_SOURCE_PREFIX}${canonicalWatchUrl(source.videoId)}`;
  const guideNotes = source.notes?.trim() ?? '';

  return {
    title: source.title,
    notes: guideNotes === '' ? sourceLine : `${sourceLine}\n\n${guideNotes}`,
    steps: source.steps.map((step) => step.instruction),
  };
}
