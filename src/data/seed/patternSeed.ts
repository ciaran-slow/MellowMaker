import type { PatternRepository } from '../contracts/patternRepository';

import seedDocument from './patternSeed.json';
import {
  parsePatternSeedDocument,
  PatternSeedError,
  type PatternSeedDocument,
} from './patternSeedDocument';

export type PatternSeedOutcome =
  | { readonly status: 'skipped'; readonly appliedSeedVersion: number }
  | {
      readonly status: 'applied';
      readonly seedVersion: number;
      readonly inserted: number;
      readonly skipped: number;
    };

/**
 * Parses the committed content and throws `PatternSeedError` listing every
 * issue.
 *
 * Parsing happens inside this call rather than at module load, so invalid
 * content surfaces through the database gate's retryable failure path instead of
 * as a bundle-time crash.
 */
export function bundledPatternSeed(): PatternSeedDocument {
  const result = parsePatternSeedDocument(seedDocument);
  if (!result.ok) {
    throw new PatternSeedError(result.issues);
  }

  return result.document;
}

/**
 * Applies a content release when the database is behind it.
 *
 * The guard reads the highest version the *ledger* records. An equal or higher
 * applied version means the release is already in place, so launch performs one
 * bounded aggregate and no writes, and an older build can never rewrite a newer
 * database.
 *
 * The version guard is only the fast path, never the safety mechanism: the
 * repository skips any slug the ledger already records, so a bundled pattern the
 * maker deleted stays deleted even across a version bump that repeats its slug.
 * Nothing here updates or deletes a pattern — a bundled pattern becomes the
 * maker's property on insert, so a later release may add new slugs only.
 */
export function applyPatternSeed(
  patterns: PatternRepository,
  document: PatternSeedDocument,
): PatternSeedOutcome {
  const applied = patterns.appliedPatternSeedVersion();

  if (applied !== undefined && applied >= document.seedVersion) {
    return { status: 'skipped', appliedSeedVersion: applied };
  }

  const { inserted, skipped } = patterns.insertSeededPatterns(
    document.seedVersion,
    document.patterns,
  );

  return {
    status: 'applied',
    seedVersion: document.seedVersion,
    inserted,
    skipped,
  };
}

/** What the platform composition calls once the database is migrated. */
export function applyBundledPatternSeed(
  patterns: PatternRepository,
): PatternSeedOutcome {
  return applyPatternSeed(patterns, bundledPatternSeed());
}
