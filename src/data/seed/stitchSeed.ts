import type { StitchRepository } from '../contracts/stitchRepository';

import seedDocument from './stitchSeed.json';
import {
  parseStitchSeedDocument,
  StitchSeedError,
  type StitchSeedDocument,
} from './stitchSeedDocument';

export type StitchSeedOutcome =
  | { readonly status: 'skipped'; readonly appliedSeedVersion: number }
  | {
      readonly status: 'applied';
      readonly seedVersion: number;
      readonly inserted: number;
      readonly updated: number;
      readonly skipped: number;
    };

/**
 * Parses the committed content and throws `StitchSeedError` listing every issue.
 *
 * Parsing happens inside this call rather than at module load, so invalid
 * content surfaces through the database gate's retryable failure path instead of
 * as a bundle-time crash.
 */
export function bundledStitchSeed(): StitchSeedDocument {
  const result = parseStitchSeedDocument(seedDocument);
  if (!result.ok) {
    throw new StitchSeedError(result.issues);
  }

  return result.document;
}

/**
 * Applies a content release when the database is behind it.
 *
 * The guard reads the highest seed version already present. An equal or higher
 * version means the release is already in place, so launch performs one bounded
 * aggregate and no writes, and an older build can never rewrite a newer
 * database. Nothing here deletes a row or touches maker-owned content: the
 * repository's `ownership = 'seed'` and `user_modified_at IS NULL` filter is the
 * only write path, and revision under a frozen slug is the only update
 * mechanism.
 */
export function applyStitchSeed(
  stitches: StitchRepository,
  document: StitchSeedDocument,
): StitchSeedOutcome {
  const applied = stitches.appliedSeedVersion();

  if (applied !== undefined && applied >= document.seedVersion) {
    return { status: 'skipped', appliedSeedVersion: applied };
  }

  const { inserted, updated, skipped } = stitches.upsertSeededStitches(
    document.seedVersion,
    document.stitches,
  );

  return {
    status: 'applied',
    seedVersion: document.seedVersion,
    inserted,
    updated,
    skipped,
  };
}

/** What the platform composition calls once the database is migrated. */
export function applyBundledStitchSeed(
  stitches: StitchRepository,
): StitchSeedOutcome {
  return applyStitchSeed(stitches, bundledStitchSeed());
}
