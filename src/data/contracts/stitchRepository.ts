import type { Page } from './page';

export type StitchDifficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * Distinguishes bundled content from maker content so a later seed release can
 * never overwrite an edit a maker made.
 */
export type ContentOwnership = 'seed' | 'user';

export interface StitchSummary {
  readonly id: string;
  readonly slug: string | undefined;
  readonly name: string;
  readonly abbreviation: string;
  readonly difficulty: StitchDifficulty;
  readonly summary: string;
  readonly ownership: ContentOwnership;
}

export interface StitchInstruction {
  readonly id: string;
  readonly position: number;
  readonly instruction: string;
  readonly imageAssetKey: string | undefined;
}

export interface StitchDetail extends StitchSummary {
  readonly seedVersion: number | undefined;
  /** Set when a maker has edited seeded content, which freezes it against seed updates. */
  readonly userModifiedAt: number | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly instructions: readonly StitchInstruction[];
}

export interface SeedStitchInstructionInput {
  readonly instruction: string;
  readonly imageAssetKey?: string;
}

export interface SeedStitchInput {
  readonly slug: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly difficulty: StitchDifficulty;
  readonly summary: string;
  readonly instructions: readonly SeedStitchInstructionInput[];
}

export interface SeedUpsertResult {
  readonly inserted: number;
  readonly updated: number;
  readonly skipped: number;
}

export interface StitchRepository {
  listStitches(page?: Page): StitchSummary[];
  getStitchDetail(id: string): StitchDetail | undefined;
  /**
   * Highest seed version present in bundled rows, or `undefined` when no seed
   * release has been imported. A seed loader's version guard reads this instead
   * of re-importing the bundled content on every launch.
   */
  appliedSeedVersion(): number | undefined;
  /**
   * Applies a seed release in one transaction. A seeded row is matched by slug;
   * maker-owned rows and seeded rows a maker has edited are left untouched and
   * reported as skipped.
   */
  upsertSeededStitches(
    seedVersion: number,
    records: readonly SeedStitchInput[],
  ): SeedUpsertResult;
}
