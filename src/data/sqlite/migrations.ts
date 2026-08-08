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
 *   normalizes, and it does so as a generated column so it cannot drift.
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

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, statements: VERSION_1_STATEMENTS },
];

export const LATEST_SCHEMA_VERSION = 1;
