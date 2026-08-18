import type { Page } from './page';

/** Where a guide step came from, so a re-import cannot silently discard maker edits. */
export type GuideStepOrigin = 'import' | 'user';

export interface ImportedGuide {
  readonly id: string;
  /** Canonical YouTube identity; unique so the same video is not imported twice. */
  readonly videoId: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly creator: string | undefined;
  readonly thumbnailUrl: string | undefined;
  readonly notes: string | undefined;
  readonly metadataSyncedAt: number | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface GuideStep {
  readonly id: string;
  readonly guideId: string;
  readonly position: number;
  readonly instruction: string;
  readonly videoOffsetMs: number | undefined;
  readonly transcriptExcerpt: string | undefined;
  readonly note: string | undefined;
  readonly completedAt: number | undefined;
  readonly origin: GuideStepOrigin;
  readonly userModifiedAt: number | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface GuideWithSteps {
  readonly guide: ImportedGuide;
  readonly steps: readonly GuideStep[];
}

export interface GuideInput {
  readonly videoId: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly creator?: string;
  readonly thumbnailUrl?: string;
  readonly notes?: string;
  readonly metadataSyncedAt?: number;
}

export interface GuideStepInput {
  readonly instruction: string;
  readonly videoOffsetMs?: number;
  readonly transcriptExcerpt?: string;
  readonly note?: string;
  readonly origin: GuideStepOrigin;
}

export interface SaveImportedGuideInput {
  readonly guide: GuideInput;
  readonly steps: readonly GuideStepInput[];
}

/** A guide list row: enough to render a library entry, no steps. */
export interface GuideSummary {
  readonly id: string;
  readonly videoId: string;
  readonly title: string;
  readonly creator: string | undefined;
  readonly thumbnailUrl: string | undefined;
  readonly updatedAt: number;
}

/**
 * A metadata-only refresh. `title` is deliberately absent: once saved it is the
 * maker's confirmed name and a refresh must never overwrite it. Omitted provider
 * fields preserve the stored value rather than erasing it.
 */
export interface RefreshGuideMetadataInput {
  readonly creator?: string;
  readonly thumbnailUrl?: string;
  readonly syncedAt: number;
}

/**
 * A deliberate maker edit of the guide's own details. Unlike a metadata refresh,
 * this rewrites the title because the maker typed it; `notes` omitted or blank
 * clears the stored notes to SQL `NULL`.
 */
export interface UpdateGuideDetailsInput {
  readonly id: string;
  readonly title: string;
  readonly notes?: string;
}

/**
 * The maker-authored content of one guide step. Instruction arrives already
 * trimmed and non-empty; each optional field omitted (or blank-normalized to
 * `undefined`) is written as SQL `NULL`.
 */
export interface GuideStepAuthoringInput {
  readonly instruction: string;
  readonly videoOffsetMs?: number;
  readonly transcriptExcerpt?: string;
  readonly note?: string;
}

export interface GuideRepository {
  /** Writes the guide and every step in one transaction. */
  saveImportedGuide(input: SaveImportedGuideInput): GuideWithSteps;
  findGuideByVideoId(videoId: string): GuideWithSteps | undefined;
  getGuideWithSteps(id: string): GuideWithSteps | undefined;
  /** Most recently updated first; the library's recorded organization method. */
  listGuides(page?: Page): readonly GuideSummary[];
  /**
   * Updates provider display metadata only. The guide's title and every step are
   * left untouched, and an omitted field preserves its stored value, so a refresh
   * can neither clobber a maker edit nor duplicate or erase instructions. Throws
   * if no guide carries the id.
   */
  refreshGuideMetadata(
    id: string,
    input: RefreshGuideMetadataInput,
  ): GuideWithSteps;
  /**
   * Rewrites the guide's title and notes and touches `updated_at`. The title is
   * maker-owned here — a deliberate edit — unlike a metadata refresh, which never
   * touches it. Throws if no guide carries the id.
   */
  updateGuideDetails(input: UpdateGuideDetailsInput): ImportedGuide;
  /**
   * Appends one step after the last, at `position = current step count`, with
   * `origin = 'user'`, and touches the parent guide.
   */
  addGuideStep(guideId: string, input: GuideStepAuthoringInput): GuideStep;
  /**
   * Rewrites one step's instruction and optional fields (an omitted optional
   * becomes SQL `NULL`), stamps `user_modified_at`, and touches its parent guide.
   */
  updateGuideStep(stepId: string, input: GuideStepAuthoringInput): void;
  /**
   * Deletes one step and re-compacts the remaining positions to `0..n-1` so the
   * contiguous-from-zero invariant the append relies on is preserved. A stale id
   * is a no-op.
   */
  deleteGuideStep(stepId: string): void;
  /**
   * Rewrites step positions to match `orderedStepIds`, which must list exactly
   * the guide's current steps once, and touches the guide.
   */
  reorderGuideSteps(guideId: string, orderedStepIds: readonly string[]): void;
  /**
   * Sets or clears one step's completion with a single absolute write —
   * `completed_at = now()` or `NULL` — never a read-modify-write or `!state`
   * toggle. Completion is working state and deliberately does not touch the
   * guide's `updated_at`, so it never churns library recency.
   */
  setGuideStepCompleted(stepId: string, completed: boolean): void;
  /** Cascades to guide steps and counters. */
  deleteGuide(id: string): void;
}
