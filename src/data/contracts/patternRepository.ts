import type { Page } from './page';

/**
 * Where a pattern row came from. Provenance only: a bundled pattern is fully
 * maker-owned from the instant it lands, so — unlike `stitch.ownership`, which
 * confers seed write authority — this grants the seed nothing and there is no
 * `userModifiedAt` companion. It is carried on the summary so a later deliberate
 * decision to mark bundled rows in the UI needs no migration.
 */
export type PatternOrigin = 'bundled' | 'user';

export interface PatternSummary {
  readonly id: string;
  readonly title: string;
  readonly notes: string | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly origin: PatternOrigin;
}

export interface PatternStep {
  readonly id: string;
  readonly patternId: string;
  readonly position: number;
  readonly instruction: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface PatternWithSteps {
  readonly pattern: PatternSummary;
  readonly steps: readonly PatternStep[];
}

export interface CreatePatternInput {
  readonly title: string;
  readonly notes?: string;
  /** Step instructions in the order the maker entered them. */
  readonly steps: readonly string[];
}

export interface SeedPatternInput {
  /** Frozen kebab-case seed identity; the key the durable ledger records. */
  readonly slug: string;
  readonly title: string;
  readonly notes: string;
  /** Step instructions in maker-visible order; the index becomes `position`. */
  readonly steps: readonly string[];
}

export interface SeedPatternResult {
  readonly inserted: number;
  /** Slugs the ledger already records — including ones the maker has deleted. */
  readonly skipped: number;
}

export interface UpdatePatternInput {
  readonly id: string;
  readonly title: string;
  /** Omitted or empty clears the notes to SQL `NULL`. */
  readonly notes?: string;
}

export interface PatternRepository {
  /**
   * Writes the pattern and every step in one transaction. The row is always
   * `origin: 'user'`, which makes "a maker can never create a bundled pattern"
   * structural rather than checked.
   */
  createPattern(input: CreatePatternInput): PatternWithSteps;
  /** Most recently updated first; the library's recorded organization method. */
  listPatterns(page?: Page): PatternSummary[];
  getPatternWithSteps(id: string): PatternWithSteps | undefined;
  /**
   * Rewrites title and notes and touches `updated_at` so the pattern floats to
   * the front of recency. Throws if no pattern carries the id.
   */
  updatePattern(input: UpdatePatternInput): PatternSummary;
  /** Appends one step after the last, at `position = current step count`. */
  addStep(patternId: string, instruction: string): PatternStep;
  /** Rewrites one step's instruction and touches its parent pattern. */
  editStep(stepId: string, instruction: string): void;
  /**
   * Deletes one step and re-compacts the remaining positions to `0..n-1` so the
   * contiguous-from-zero invariant the append relies on is preserved.
   */
  deleteStep(stepId: string): void;
  /**
   * Rewrites step positions to match `orderedStepIds`, which must list exactly
   * the pattern's current steps.
   */
  reorderSteps(patternId: string, orderedStepIds: readonly string[]): void;
  /**
   * Cascades to steps, per-step progress, the active position, and counters.
   * A bundled pattern's `pattern_seed_state` row is deliberately *not* removed:
   * its `pattern_id` is nulled and the row stays as the tombstone that stops the
   * next launch re-inserting the slug.
   */
  deletePattern(id: string): void;
  /**
   * Highest seed version the pattern ledger records, or `undefined` when no
   * release has been applied. Read from `pattern_seed_state`, never from the
   * pattern rows, so deleting every bundled pattern cannot make the database
   * look unseeded.
   */
  appliedPatternSeedVersion(): number | undefined;
  /**
   * Applies a release in one transaction. Insert-only: a slug the ledger already
   * records is skipped whether or not its pattern still exists, so a deleted
   * bundled pattern is never resurrected and a maker's edits are never
   * rewritten. There is deliberately no seed update path and no seed delete
   * path anywhere in this contract.
   */
  insertSeededPatterns(
    seedVersion: number,
    records: readonly SeedPatternInput[],
  ): SeedPatternResult;
}
