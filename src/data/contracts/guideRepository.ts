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
  /** Cascades to guide steps and counters. */
  deleteGuide(id: string): void;
}
