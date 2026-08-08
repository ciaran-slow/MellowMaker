import type { Page } from './page';

export interface PatternSummary {
  readonly id: string;
  readonly title: string;
  readonly notes: string | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
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

export interface PatternRepository {
  /** Writes the pattern and every step in one transaction. */
  createPattern(input: CreatePatternInput): PatternWithSteps;
  /** Most recently updated first; the library's recorded organization method. */
  listPatterns(page?: Page): PatternSummary[];
  getPatternWithSteps(id: string): PatternWithSteps | undefined;
  /**
   * Rewrites step positions to match `orderedStepIds`, which must list exactly
   * the pattern's current steps.
   */
  reorderSteps(patternId: string, orderedStepIds: readonly string[]): void;
  /** Cascades to steps, per-step progress, the active position, and counters. */
  deletePattern(id: string): void;
}
