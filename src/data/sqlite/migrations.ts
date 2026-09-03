/**
 * The single source of schema truth. This module imports nothing so the Expo
 * adapter and the `node:sqlite` integration harness apply the same statements.
 *
 * Conventions every table follows:
 * - identity is a generated v4 UUID in `id TEXT PRIMARY KEY`, never a name,
 *   slug, or list position;
 * - instants are `INTEGER` milliseconds since the Unix epoch in UTC and their
 *   column name ends in `_at`;
 * - a wall-clock calendar date (none exists at version 1) would be ISO-8601
 *   `YYYY-MM-DD` `TEXT`, converted to local time only in presentation;
 * - maker-reorderable lists carry `position INTEGER NOT NULL CHECK (position >= 0)`,
 *   contiguous from 0 within their parent and unique per parent;
 * - completion is a nullable `completed_at` instant rather than a boolean, so
 *   "when" is never lost;
 * - text arrives already trimmed from the caller; only `stitch.search_text`
 *   normalizes, and it does so as a generated column so it cannot drift;
 * - every child of an aggregate root is `ON DELETE CASCADE`. Exactly two columns
 *   are `ON DELETE SET NULL`, both deliberately: `pattern_progress.active_step_id`,
 *   so deleting one step clears the pointer instead of destroying the pattern's
 *   progress, and `pattern_seed_state.pattern_id` (version 2), so the seed
 *   ledger row outlives the pattern it created and the next launch cannot
 *   resurrect a bundled pattern the maker deleted.
 *
 * Every future schema change appends a migration with the next integer version
 * and ships its own populated upgrade fixture; existing statements are frozen.
 */
export interface Migration {
  readonly version: number;
  readonly statements: readonly string[];
}

const VERSION_1_STATEMENTS: readonly string[] = [
  `CREATE TABLE stitch (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner','intermediate','advanced')),
    summary TEXT NOT NULL,
    ownership TEXT NOT NULL CHECK (ownership IN ('seed','user')),
    seed_version INTEGER,
    user_modified_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    search_text TEXT GENERATED ALWAYS AS (lower(trim(name)) || ' ' || lower(trim(abbreviation))) STORED,
    CHECK ((ownership = 'seed') = (slug IS NOT NULL AND seed_version IS NOT NULL))
  )`,
  'CREATE INDEX stitch_search_text_idx ON stitch (search_text)',
  `CREATE TABLE stitch_instruction (
    id TEXT PRIMARY KEY,
    stitch_id TEXT NOT NULL REFERENCES stitch(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    instruction TEXT NOT NULL,
    image_asset_key TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (stitch_id, position)
  )`,
  `CREATE TABLE pattern (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE INDEX pattern_recent_idx ON pattern (updated_at DESC, id ASC)',
  `CREATE TABLE pattern_step (
    id TEXT PRIMARY KEY,
    pattern_id TEXT NOT NULL REFERENCES pattern(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    instruction TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (pattern_id, position)
  )`,
  `CREATE TABLE pattern_progress (
    pattern_id TEXT PRIMARY KEY REFERENCES pattern(id) ON DELETE CASCADE,
    active_step_id TEXT REFERENCES pattern_step(id) ON DELETE SET NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE pattern_step_progress (
    step_id TEXT PRIMARY KEY REFERENCES pattern_step(id) ON DELETE CASCADE,
    pattern_id TEXT NOT NULL REFERENCES pattern(id) ON DELETE CASCADE,
    completed_at INTEGER,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE INDEX pattern_step_progress_pattern_idx ON pattern_step_progress (pattern_id)',
  `CREATE TABLE imported_guide (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL UNIQUE,
    source_url TEXT NOT NULL,
    title TEXT NOT NULL,
    creator TEXT,
    thumbnail_url TEXT,
    notes TEXT,
    metadata_synced_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE guide_step (
    id TEXT PRIMARY KEY,
    guide_id TEXT NOT NULL REFERENCES imported_guide(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    instruction TEXT NOT NULL,
    video_offset_ms INTEGER CHECK (video_offset_ms IS NULL OR video_offset_ms >= 0),
    transcript_excerpt TEXT,
    note TEXT,
    completed_at INTEGER,
    origin TEXT NOT NULL CHECK (origin IN ('import','user')),
    user_modified_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (guide_id, position)
  )`,
  `CREATE TABLE counter (
    id TEXT PRIMARY KEY,
    owner_kind TEXT NOT NULL CHECK (owner_kind IN ('pattern','guide')),
    pattern_id TEXT REFERENCES pattern(id) ON DELETE CASCADE,
    guide_id TEXT REFERENCES imported_guide(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('row','stitch','custom')),
    value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK ((owner_kind = 'pattern') = (pattern_id IS NOT NULL)),
    CHECK ((owner_kind = 'guide') = (guide_id IS NOT NULL)),
    UNIQUE (pattern_id, position),
    UNIQUE (guide_id, position)
  )`,
];

/**
 * Bundled beginner patterns (issue #44).
 *
 * `pattern.origin` records where a row came from and nothing else. It grants the
 * seed no write authority — unlike `stitch.ownership`, a bundled pattern is
 * fully maker-owned from the instant it lands — so there is no companion
 * `user_modified_at`. `DEFAULT 'user'` is what backfills every pattern an
 * existing version-1 database already holds.
 *
 * `pattern_seed_state` is the durable seed ledger. Deleting a bundled pattern
 * nulls `pattern_id` and leaves the row standing, so a slug the seed has already
 * inserted is never inserted again. Deriving that fact from the pattern rows
 * instead — the way the stitch seed reads `MAX(seed_version)` over `stitch` —
 * would resurrect every bundled pattern a maker deleted on the next launch.
 */
const VERSION_2_STATEMENTS: readonly string[] = [
  `ALTER TABLE pattern ADD COLUMN origin TEXT NOT NULL DEFAULT 'user'
     CHECK (origin IN ('bundled','user'))`,
  `CREATE TABLE pattern_seed_state (
    slug TEXT PRIMARY KEY,
    pattern_id TEXT REFERENCES pattern(id) ON DELETE SET NULL,
    seed_version INTEGER NOT NULL,
    seeded_at INTEGER NOT NULL
  )`,
];

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, statements: VERSION_1_STATEMENTS },
  { version: 2, statements: VERSION_2_STATEMENTS },
];

export const LATEST_SCHEMA_VERSION = 2;
