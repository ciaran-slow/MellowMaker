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
 *   normalizes, and it does so as a generated column so it cannot drift. From
 *   version 3 the two step-instruction columns additionally carry a non-empty
 *   `CHECK` the caller cannot bypass — a floor underneath the domain guards,
 *   not a replacement for them;
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
  /**
   * `'off'` runs this migration with `PRAGMA foreign_keys = OFF` and verifies
   * the database with `PRAGMA foreign_key_check` before committing — steps 1,
   * 10, and 12 of SQLite's table-rebuild procedure. Required by any migration
   * that `DROP`s a table another table references: with enforcement on, the
   * `DROP` performs an implicit `DELETE` that fires `ON DELETE` actions and
   * destroys the referencing rows without raising anything at all. See
   * architecture §7 rule 9.
   */
  readonly foreignKeys?: 'off';
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

/**
 * A schema-level floor under every step instruction (issue #67).
 *
 * `NOT NULL` rejects `NULL` and accepts `''`, so until now the only thing
 * keeping a nameless step off the disk was every caller remembering to check.
 * SQLite cannot `ALTER TABLE ... ADD CONSTRAINT`, so both tables are rebuilt
 * through the documented 12-step procedure: create the revised table under a
 * non-colliding name, copy, `DROP` the old one, rename the new one into its
 * place. Step 6 (`DROP`) strictly precedes step 7 (`RENAME`) — reversing them is
 * the documented way to get the *other* tables' `REFERENCES` clauses silently
 * rewritten. Steps 3, 8, and 9 are no-ops: neither table carries an explicit
 * index, trigger, or view, and `UNIQUE` re-creates its own `sqlite_autoindex_*`
 * from the `CREATE TABLE`.
 *
 * **This migration is declared `foreignKeys: 'off'` and cannot run without it.**
 * With enforcement on, `DROP TABLE pattern_step` performs an implicit `DELETE`
 * that fires `pattern_step_progress`' `ON DELETE CASCADE` and
 * `pattern_progress.active_step_id`'s `ON DELETE SET NULL` — measured, the
 * migration then commits successfully having destroyed every completion instant
 * and every active pointer the maker had. `PRAGMA defer_foreign_keys` does not
 * prevent it: deferral postpones violation *checking*, not the *actions*.
 *
 * The predicate is the two-argument `trim`. SQLite's one-argument `trim(X)`
 * strips only U+0020, so `trim(instruction) <> ''` would accept a tab-only,
 * newline-only, NBSP-only, or BOM-only instruction — exactly the shapes that
 * arrive from text pasted out of a web page. The character set is deliberately a
 * strict *subset* of `String.prototype.trim()`'s, so the schema can never reject
 * a value the domain layer accepts (U+200B, which JS does not trim, stays
 * accepted by both).
 *
 * The placeholder literal is frozen DDL and is deliberately **not** imported
 * from the domain: a migration is a historical record, and a copy change in
 * `validateGuideStepInstruction` must not retroactively alter what a device
 * already wrote. A pre-existing empty row is repaired inside the copy `SELECT`
 * rather than deleted — deleting it would strand `pattern_step_progress` and
 * lose a position, a timestamp, and possibly a completion instant — and rather
 * than aborting, which would brick the app at the database gate forever, since
 * there is no reset path anywhere.
 */
const EMPTY_INSTRUCTION = "trim(instruction, char(9,10,11,12,13,32,160,65279)) = ''";
const STEP_INSTRUCTION_PLACEHOLDER = 'Add an instruction for this step';

const VERSION_3_STATEMENTS: readonly string[] = [
  `CREATE TABLE pattern_step_new (
    id TEXT PRIMARY KEY,
    pattern_id TEXT NOT NULL REFERENCES pattern(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    instruction TEXT NOT NULL
      CONSTRAINT pattern_step_instruction_not_empty
      CHECK (trim(instruction, char(9,10,11,12,13,32,160,65279)) <> ''),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (pattern_id, position)
  )`,
  // The CASE is the only expression in the copy; every other column is verbatim,
  // so ids, positions, and timestamps cannot drift. A repair deliberately does
  // not touch `updated_at` — the migration is not a maker edit.
  `INSERT INTO pattern_step_new (id, pattern_id, position, instruction, created_at, updated_at)
     SELECT id, pattern_id, position,
       CASE WHEN ${EMPTY_INSTRUCTION}
         THEN '${STEP_INSTRUCTION_PLACEHOLDER}'
         ELSE instruction END,
       created_at, updated_at
     FROM pattern_step`,
  'DROP TABLE pattern_step',
  'ALTER TABLE pattern_step_new RENAME TO pattern_step',
  `CREATE TABLE guide_step_new (
    id TEXT PRIMARY KEY,
    guide_id TEXT NOT NULL REFERENCES imported_guide(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    instruction TEXT NOT NULL
      CONSTRAINT guide_step_instruction_not_empty
      CHECK (trim(instruction, char(9,10,11,12,13,32,160,65279)) <> ''),
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
  // `origin` and `user_modified_at` ride across untouched: a repair must never
  // claim the maker edited an imported step.
  `INSERT INTO guide_step_new (id, guide_id, position, instruction, video_offset_ms,
                               transcript_excerpt, note, completed_at, origin,
                               user_modified_at, created_at, updated_at)
     SELECT id, guide_id, position,
       CASE WHEN ${EMPTY_INSTRUCTION}
         THEN '${STEP_INSTRUCTION_PLACEHOLDER}'
         ELSE instruction END,
       video_offset_ms, transcript_excerpt, note, completed_at, origin,
       user_modified_at, created_at, updated_at
     FROM guide_step`,
  'DROP TABLE guide_step',
  'ALTER TABLE guide_step_new RENAME TO guide_step',
];

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, statements: VERSION_1_STATEMENTS },
  { version: 2, statements: VERSION_2_STATEMENTS },
  { version: 3, statements: VERSION_3_STATEMENTS, foreignKeys: 'off' },
];

export const LATEST_SCHEMA_VERSION = 3;
