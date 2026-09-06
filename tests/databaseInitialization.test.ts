/** @jest-environment node */

import { DatabaseError } from '@/data/contracts/databaseError';
import { applyBundledPatternSeed } from '@/data/seed/patternSeed';
import { createRepositories } from '@/data/sqlite/createRepositories';
import { initializeDatabase } from '@/data/sqlite/initializeDatabase';
import {
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  type Migration,
} from '@/data/sqlite/migrations';
import type {
  SqliteConnection,
  SqlValue,
} from '@/data/sqlite/sqliteConnection';

import { BASELINE, insertPopulatedBaseline } from './support/populatedBaseline';
import { createNodeSqliteConnection } from './support/sqliteHarness';

const EXPECTED_TABLES = [
  'counter',
  'guide_step',
  'imported_guide',
  'pattern',
  'pattern_progress',
  'pattern_seed_state',
  'pattern_step',
  'pattern_step_progress',
  'stitch',
  'stitch_instruction',
];

const EXPECTED_INDEXES = [
  'pattern_recent_idx',
  'pattern_step_progress_pattern_idx',
  'stitch_search_text_idx',
];

const ADD_COLUMN_MIGRATION: Migration = {
  version: LATEST_SCHEMA_VERSION + 1,
  statements: ['ALTER TABLE pattern ADD COLUMN colour_tag TEXT'],
};

/** Second statement names a table that does not exist, as a typo in a real migration would. */
const FAILING_MIGRATION: Migration = {
  version: LATEST_SCHEMA_VERSION + 1,
  statements: [
    'CREATE TABLE migration_probe (id TEXT PRIMARY KEY)',
    'ALTER TABLE pattern_typo ADD COLUMN colour_tag TEXT',
  ],
};

/** Second statement is the recorded version, so its failure must roll back the first. */
const VERSION_PROBE_MIGRATION: Migration = {
  version: LATEST_SCHEMA_VERSION + 1,
  statements: ['CREATE TABLE version_probe (id TEXT PRIMARY KEY)'],
};

/** A table rebuild whose second statement is a typo, so the whole thing rolls back. */
const FAILING_REBUILD_MIGRATION: Migration = {
  version: LATEST_SCHEMA_VERSION + 1,
  foreignKeys: 'off',
  statements: [
    'CREATE TABLE rebuild_probe (id TEXT PRIMARY KEY)',
    'ALTER TABLE pattern_typo ADD COLUMN colour_tag TEXT',
  ],
};

/**
 * The "just delete the empty row" strategy in miniature: a rebuild that copies
 * every `pattern_step` **except** the one `pattern_step_progress` references.
 * With foreign keys off nothing objects while it runs, so only the runner's
 * `PRAGMA foreign_key_check` can catch it before it commits.
 */
const ORPHANING_REBUILD_MIGRATION: Migration = {
  version: LATEST_SCHEMA_VERSION + 1,
  foreignKeys: 'off',
  statements: [
    `CREATE TABLE pattern_step_new (
      id TEXT PRIMARY KEY,
      pattern_id TEXT NOT NULL REFERENCES pattern(id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK (position >= 0),
      instruction TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (pattern_id, position)
    )`,
    `INSERT INTO pattern_step_new (id, pattern_id, position, instruction, created_at, updated_at)
       SELECT id, pattern_id, position, instruction, created_at, updated_at
       FROM pattern_step WHERE id <> 'step-sunrise-0'`,
    'DROP TABLE pattern_step',
    'ALTER TABLE pattern_step_new RENAME TO pattern_step',
  ],
};

/** A rebuild that must never begin once the disable pragma is known to be ignored. */
const REBUILD_PROBE_MIGRATION: Migration = {
  version: LATEST_SCHEMA_VERSION + 1,
  foreignKeys: 'off',
  statements: ['CREATE TABLE rebuild_probe (id TEXT PRIMARY KEY)'],
};

/**
 * Swallows `PRAGMA foreign_keys = OFF` while leaving the read-back reporting
 * `1` — exactly what SQLite does when the pragma is issued with a transaction
 * somehow open. Without the runner's read-back this is silent, and the rebuild
 * proceeds with enforcement on.
 */
function swallowForeignKeyDisable(
  connection: SqliteConnection,
): SqliteConnection {
  return {
    ...connection,
    execute(sql) {
      if (sql === 'PRAGMA foreign_keys = OFF') {
        return;
      }

      connection.execute(sql);
    },
  };
}

/**
 * Fails the recorded-version write and nothing else, standing in for a crash
 * between the migration's statements and its version.
 */
function failingVersionWrite(connection: SqliteConnection): SqliteConnection {
  return {
    ...connection,
    execute(sql) {
      if (sql.startsWith('PRAGMA user_version =')) {
        throw new Error('interrupted before the version was recorded');
      }

      connection.execute(sql);
    },
  };
}

function objectNames(connection: SqliteConnection, type: string): string[] {
  return connection
    .all<{ readonly name: string }>(
      "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
      [type],
    )
    .map((row) => row.name);
}

function schemaVersionOf(connection: SqliteConnection): number {
  return (
    connection.first<{ readonly user_version: number }>('PRAGMA user_version')
      ?.user_version ?? -1
  );
}

function foreignKeysEnabled(connection: SqliteConnection): number {
  return (
    connection.first<{ readonly foreign_keys: number }>('PRAGMA foreign_keys')
      ?.foreign_keys ?? -1
  );
}

function captureFailure(work: () => void): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }

  throw new Error('Expected the database operation to fail.');
}

describe('database initialization', () => {
  let connection: SqliteConnection;

  beforeEach(() => {
    connection = createNodeSqliteConnection();
  });

  afterEach(() => {
    connection.close();
  });

  it('keeps the advertised latest version in step with the migration list', () => {
    const highest = MIGRATIONS.reduce(
      (version, migration) => Math.max(version, migration.version),
      0,
    );

    expect(LATEST_SCHEMA_VERSION).toBe(highest);
    expect(MIGRATIONS.map((migration) => migration.version)).toStrictEqual([
      1, 2, 3,
    ]);
  });

  it('creates the whole schema and turns on foreign-key enforcement', () => {
    expect(foreignKeysEnabled(connection)).toBe(0);

    const result = initializeDatabase(connection);

    expect(result).toStrictEqual({
      schemaVersion: 3,
      appliedMigrations: [1, 2, 3],
    });
    expect(schemaVersionOf(connection)).toBe(3);
    expect(objectNames(connection, 'table')).toStrictEqual(EXPECTED_TABLES);
    expect(objectNames(connection, 'index')).toEqual(
      expect.arrayContaining(EXPECTED_INDEXES),
    );
    expect(foreignKeysEnabled(connection)).toBe(1);
  });

  it('applies nothing on reopen and leaves stored rows in place', () => {
    initializeDatabase(connection);
    insertPopulatedBaseline(connection);

    const reopened = initializeDatabase(connection);

    expect(reopened).toStrictEqual({ schemaVersion: 3, appliedMigrations: [] });
    expect(
      connection.first<{ readonly title: string }>(
        'SELECT title FROM pattern WHERE id = ?',
        [BASELINE.patterns[0].id],
      )?.title,
    ).toBe('Sunrise Blanket');
  });

  it('applies migrations in ascending order whatever order they are listed in', () => {
    const applied = initializeDatabase(connection, {
      migrations: [ADD_COLUMN_MIGRATION, ...MIGRATIONS],
    });

    expect(applied).toStrictEqual({
      schemaVersion: 4,
      appliedMigrations: [1, 2, 3, 4],
    });
    expect(
      connection
        .all<{ readonly name: string }>('PRAGMA table_info(pattern)')
        .map((column) => column.name),
    ).toContain('colour_tag');
  });

  it('upgrades a populated database without losing maker data', () => {
    initializeDatabase(connection);
    insertPopulatedBaseline(connection);

    const upgraded = initializeDatabase(connection, {
      migrations: [...MIGRATIONS, ADD_COLUMN_MIGRATION],
    });

    expect(upgraded).toStrictEqual({ schemaVersion: 4, appliedMigrations: [4] });
    expect(schemaVersionOf(connection)).toBe(4);
    expect(
      connection
        .all<{ readonly name: string }>('PRAGMA table_info(pattern)')
        .map((column) => column.name),
    ).toContain('colour_tag');

    expect(
      connection.all<{ readonly title: string; readonly notes: string | null }>(
        'SELECT title, notes FROM pattern ORDER BY created_at ASC',
      ),
    ).toEqual([
      { title: 'Sunrise Blanket', notes: 'Hook 5.0 mm, cotton yarn' },
      { title: 'Tiny Hedgehog', notes: null },
    ]);
    expect(
      connection
        .all<{ readonly instruction: string }>(
          'SELECT instruction FROM pattern_step WHERE pattern_id = ? ORDER BY position ASC',
          [BASELINE.patterns[0].id],
        )
        .map((step) => step.instruction),
    ).toStrictEqual([
      'Chain 41',
      'Single crochet in each chain across',
      'Chain 1, turn, and repeat until 40 rows',
    ]);
    expect(
      connection.first<{ readonly active_step_id: string | null }>(
        'SELECT active_step_id FROM pattern_progress WHERE pattern_id = ?',
        [BASELINE.activeStep.patternId],
      )?.active_step_id,
    ).toBe('step-sunrise-1');
    expect(
      connection.first<{ readonly completed_at: number | null }>(
        'SELECT completed_at FROM pattern_step_progress WHERE step_id = ?',
        [BASELINE.completedStep.stepId],
      )?.completed_at,
    ).toBe(1_699_000_200_000);
    expect(
      connection.first<{
        readonly title: string;
        readonly notes: string | null;
      }>('SELECT title, notes FROM imported_guide WHERE video_id = ?', [
        BASELINE.guide.videoId,
      ]),
    ).toEqual({
      title: 'Granny square basics',
      notes: 'Follow along slowly the first time',
    });
    expect(
      connection.first<{
        readonly instruction: string;
        readonly video_offset_ms: number | null;
        readonly note: string | null;
      }>(
        'SELECT instruction, video_offset_ms, note FROM guide_step WHERE id = ?',
        [BASELINE.guide.step.id],
      ),
    ).toEqual({
      instruction: 'Make a magic ring and chain three',
      video_offset_ms: 42_000,
      note: 'Keep the ring loose so it can be pulled tight later',
    });
    expect(
      connection.first<{ readonly value: number }>(
        'SELECT value FROM counter WHERE id = ?',
        [BASELINE.counter.id],
      )?.value,
    ).toBe(7);
  });

  it('upgrades a populated version-1 database to the latest version without losing maker data', () => {
    // The fixture starts on a real shipped schema rather than a synthetic one.
    // `insertPopulatedBaseline` names its columns explicitly, so it is valid
    // against versions 1, 2, and 3 alike. Running the whole production list from
    // version 1 is what exercises the two-hop v1 -> v3 path.
    initializeDatabase(connection, {
      migrations: MIGRATIONS.filter((migration) => migration.version === 1),
    });
    insertPopulatedBaseline(connection);

    const upgraded = initializeDatabase(connection);

    expect(upgraded).toStrictEqual({
      schemaVersion: 3,
      appliedMigrations: [2, 3],
    });
    expect(schemaVersionOf(connection)).toBe(3);
    expect(objectNames(connection, 'table')).toStrictEqual(EXPECTED_TABLES);

    expect(
      connection.all<{ readonly title: string; readonly notes: string | null }>(
        'SELECT title, notes FROM pattern ORDER BY created_at ASC',
      ),
    ).toEqual([
      { title: 'Sunrise Blanket', notes: 'Hook 5.0 mm, cotton yarn' },
      { title: 'Tiny Hedgehog', notes: null },
    ]);
    expect(
      connection
        .all<{ readonly instruction: string }>(
          'SELECT instruction FROM pattern_step WHERE pattern_id = ? ORDER BY position ASC',
          [BASELINE.patterns[0].id],
        )
        .map((step) => step.instruction),
    ).toStrictEqual([
      'Chain 41',
      'Single crochet in each chain across',
      'Chain 1, turn, and repeat until 40 rows',
    ]);
    expect(
      connection.first<{ readonly active_step_id: string | null }>(
        'SELECT active_step_id FROM pattern_progress WHERE pattern_id = ?',
        [BASELINE.activeStep.patternId],
      )?.active_step_id,
    ).toBe('step-sunrise-1');
    expect(
      connection.first<{ readonly completed_at: number | null }>(
        'SELECT completed_at FROM pattern_step_progress WHERE step_id = ?',
        [BASELINE.completedStep.stepId],
      )?.completed_at,
    ).toBe(1_699_000_200_000);
    expect(
      connection.first<{
        readonly title: string;
        readonly notes: string | null;
      }>('SELECT title, notes FROM imported_guide WHERE video_id = ?', [
        BASELINE.guide.videoId,
      ]),
    ).toEqual({
      title: 'Granny square basics',
      notes: 'Follow along slowly the first time',
    });
    expect(
      connection.first<{
        readonly video_offset_ms: number | null;
        readonly note: string | null;
      }>('SELECT video_offset_ms, note FROM guide_step WHERE id = ?', [
        BASELINE.guide.step.id,
      ]),
    ).toEqual({
      video_offset_ms: 42_000,
      note: 'Keep the ring loose so it can be pulled tight later',
    });
    expect(
      connection.first<{ readonly value: number }>(
        'SELECT value FROM counter WHERE id = ?',
        [BASELINE.counter.id],
      )?.value,
    ).toBe(7);

    // The column default is what backfills provenance: every pattern the maker
    // already had is theirs, and the migration seeds nothing by itself.
    expect(
      connection
        .all<{ readonly id: string; readonly origin: string }>(
          'SELECT id, origin FROM pattern ORDER BY id',
        )
        .map((row) => [row.id, row.origin]),
    ).toStrictEqual([
      ['pattern-hedgehog', 'user'],
      ['pattern-sunrise', 'user'],
    ]);
    expect(
      connection.first<{ readonly total: number }>(
        'SELECT COUNT(*) AS total FROM pattern_seed_state',
      )?.total,
    ).toBe(0);
  });

  describe('migration 3 \u2014 the step-instruction floor (issue #67)', () => {
    /** Brings a fresh connection to the schema migration 3 upgrades *from*. */
    function initializeAtVersionTwo(): void {
      initializeDatabase(connection, {
        migrations: MIGRATIONS.filter((migration) => migration.version <= 2),
      });
    }

    it('upgrades a populated version-2 database without losing a row, an instant, or a pointer', () => {
      initializeAtVersionTwo();
      insertPopulatedBaseline(connection);

      const upgraded = initializeDatabase(connection);

      expect(upgraded).toStrictEqual({
        schemaVersion: 3,
        appliedMigrations: [3],
      });
      expect(schemaVersionOf(connection)).toBe(3);

      expect(
        connection.all<{
          readonly title: string;
          readonly notes: string | null;
        }>('SELECT title, notes FROM pattern ORDER BY created_at ASC'),
      ).toEqual([
        { title: 'Sunrise Blanket', notes: 'Hook 5.0 mm, cotton yarn' },
        { title: 'Tiny Hedgehog', notes: null },
      ]);
      expect(
        connection
          .all<{ readonly id: string; readonly instruction: string }>(
            'SELECT id, instruction FROM pattern_step ORDER BY pattern_id ASC, position ASC',
          )
          .map((step) => [step.id, step.instruction]),
      ).toStrictEqual([
        ['step-hedgehog-0', 'Magic ring, 6 sc'],
        ['step-hedgehog-1', 'Increase to 12 sc'],
        ['step-sunrise-0', 'Chain 41'],
        ['step-sunrise-1', 'Single crochet in each chain across'],
        ['step-sunrise-2', 'Chain 1, turn, and repeat until 40 rows'],
      ]);

      // The two assertions a build that forgets `foreignKeys: 'off'` breaks.
      // Measured: with enforcement on, `DROP TABLE pattern_step` fires the
      // cascade and the SET NULL, the migration still commits, and these two go
      // to zero rows and NULL with no error raised anywhere.
      expect(
        connection.first<{ readonly completed_at: number | null }>(
          'SELECT completed_at FROM pattern_step_progress WHERE step_id = ?',
          [BASELINE.completedStep.stepId],
        )?.completed_at,
      ).toBe(1_699_000_200_000);
      expect(
        connection.first<{ readonly active_step_id: string | null }>(
          'SELECT active_step_id FROM pattern_progress WHERE pattern_id = ?',
          [BASELINE.activeStep.patternId],
        )?.active_step_id,
      ).toBe('step-sunrise-1');

      expect(
        connection.first<{
          readonly title: string;
          readonly notes: string | null;
        }>('SELECT title, notes FROM imported_guide WHERE video_id = ?', [
          BASELINE.guide.videoId,
        ]),
      ).toEqual({
        title: 'Granny square basics',
        notes: 'Follow along slowly the first time',
      });
      expect(
        connection.all<{
          readonly id: string;
          readonly instruction: string;
          readonly video_offset_ms: number | null;
          readonly transcript_excerpt: string | null;
          readonly note: string | null;
          readonly origin: string;
          readonly user_modified_at: number | null;
        }>(
          'SELECT id, instruction, video_offset_ms, transcript_excerpt, note, origin, user_modified_at FROM guide_step ORDER BY position ASC',
        ),
      ).toEqual([
        {
          id: 'guide-step-magic-ring',
          instruction: 'Make a magic ring and chain three',
          video_offset_ms: 42_000,
          transcript_excerpt: 'start with a magic ring, then chain three',
          note: 'Keep the ring loose so it can be pulled tight later',
          origin: 'import',
          user_modified_at: null,
        },
        {
          id: 'guide-step-first-round',
          instruction:
            'Chain three and work eleven double crochets into the ring',
          video_offset_ms: 96_000,
          transcript_excerpt:
            'now chain three, that counts as your first double',
          note: null,
          origin: 'import',
          user_modified_at: null,
        },
      ]);

      expect(
        connection
          .all<{ readonly id: string; readonly value: number }>(
            'SELECT id, value FROM counter ORDER BY id ASC',
          )
          .map((row) => [row.id, row.value]),
      ).toStrictEqual([
        ['counter-granny-rounds', 3],
        ['counter-sunrise-rows', 7],
      ]);

      expect(
        connection
          .all<{ readonly id: string; readonly origin: string }>(
            'SELECT id, origin FROM pattern ORDER BY id',
          )
          .map((row) => [row.id, row.origin]),
      ).toStrictEqual([
        ['pattern-hedgehog', 'user'],
        ['pattern-sunrise', 'user'],
      ]);
      expect(
        connection.first<{ readonly total: number }>(
          'SELECT COUNT(*) AS total FROM pattern_seed_state',
        )?.total,
      ).toBe(0);

      // Steps 3, 8, and 9 of the rebuild are no-ops here, and the rename left
      // nothing behind.
      expect(objectNames(connection, 'table')).toStrictEqual(EXPECTED_TABLES);
      expect(objectNames(connection, 'index')).toEqual(
        expect.arrayContaining(EXPECTED_INDEXES),
      );
      expect(
        objectNames(connection, 'table').filter((name) =>
          name.endsWith('_new'),
        ),
      ).toStrictEqual([]);
      expect(foreignKeysEnabled(connection)).toBe(1);
    });

    // Written out here rather than imported from `migrations.ts`: a migration's
    // literals are frozen, and a test that re-derives one cannot notice it
    // changing.
    const REPAIRED = 'Add an instruction for this step';

    it.each([
      ['an empty string', ''],
      ['spaces only', '   '],
      ['a tab only', '\t'],
      ['a non-breaking space only', '\u00a0'],
    ])(
      'repairs a pre-existing step whose instruction is %s, keeping everything around it',
      (_label, emptyInstruction) => {
        initializeAtVersionTwo();
        insertPopulatedBaseline(connection);

        // Slot the empty step in at position 1 of a fresh pattern, between two
        // real steps, and aim both a completion row and the active pointer at it.
        connection.run(
          "INSERT INTO pattern (id, title, notes, created_at, updated_at, origin) VALUES ('pattern-gap', 'Gap Blanket', NULL, 500, 600, 'user')",
        );
        for (const [id, position, instruction] of [
          ['step-gap-0', 0, 'Chain 20'],
          ['step-gap-1', 1, emptyInstruction],
          ['step-gap-2', 2, 'Turn and work back'],
        ] as const) {
          connection.run(
            'INSERT INTO pattern_step (id, pattern_id, position, instruction, created_at, updated_at) VALUES (?, ?, ?, ?, 700, 800)',
            [id, 'pattern-gap', position, instruction],
          );
        }
        connection.run(
          "INSERT INTO pattern_step_progress (step_id, pattern_id, completed_at, updated_at) VALUES ('step-gap-1', 'pattern-gap', 900, 900)",
        );
        connection.run(
          "INSERT INTO pattern_progress (pattern_id, active_step_id, updated_at) VALUES ('pattern-gap', 'step-gap-1', 950)",
        );

        connection.run(
          "INSERT INTO imported_guide (id, video_id, source_url, title, created_at, updated_at) VALUES ('guide-gap', 'video-gap', 'https://www.youtube.com/watch?v=video-gap', 'Gap guide', 1, 1)",
        );
        for (const [id, position, instruction] of [
          ['guide-step-gap-0', 0, 'Slip knot'],
          ['guide-step-gap-1', 1, emptyInstruction],
          ['guide-step-gap-2', 2, 'Fasten off'],
        ] as const) {
          connection.run(
            'INSERT INTO guide_step (id, guide_id, position, instruction, video_offset_ms, transcript_excerpt, note, completed_at, origin, user_modified_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1200, NULL, NULL, NULL, ?, NULL, 700, 800)',
            [id, 'guide-gap', position, instruction, 'import'],
          );
        }

        expect(initializeDatabase(connection)).toStrictEqual({
          schemaVersion: 3,
          appliedMigrations: [3],
        });

        // Repaired in place: the id proves the row was copied, not re-created.
        expect(
          connection
            .all<{
              readonly id: string;
              readonly position: number;
              readonly instruction: string;
              readonly created_at: number;
              readonly updated_at: number;
            }>(
              'SELECT id, position, instruction, created_at, updated_at FROM pattern_step WHERE pattern_id = ? ORDER BY position ASC',
              ['pattern-gap'],
            )
            .map((step) => [
              step.id,
              step.position,
              step.instruction,
              step.created_at,
              step.updated_at,
            ]),
        ).toStrictEqual([
          ['step-gap-0', 0, 'Chain 20', 700, 800],
          ['step-gap-1', 1, REPAIRED, 700, 800],
          ['step-gap-2', 2, 'Turn and work back', 700, 800],
        ]);
        expect(
          connection
            .all<{
              readonly id: string;
              readonly position: number;
              readonly instruction: string;
              readonly origin: string;
              readonly user_modified_at: number | null;
              readonly created_at: number;
              readonly updated_at: number;
            }>(
              'SELECT id, position, instruction, origin, user_modified_at, created_at, updated_at FROM guide_step WHERE guide_id = ? ORDER BY position ASC',
              ['guide-gap'],
            )
            .map((step) => [
              step.id,
              step.position,
              step.instruction,
              step.origin,
              step.user_modified_at,
              step.created_at,
              step.updated_at,
            ]),
        ).toStrictEqual([
          ['guide-step-gap-0', 0, 'Slip knot', 'import', null, 700, 800],
          ['guide-step-gap-1', 1, REPAIRED, 'import', null, 700, 800],
          ['guide-step-gap-2', 2, 'Fasten off', 'import', null, 700, 800],
        ]);

        // Nothing hanging off the repaired step was destroyed.
        expect(
          connection.first<{ readonly completed_at: number | null }>(
            'SELECT completed_at FROM pattern_step_progress WHERE step_id = ?',
            ['step-gap-1'],
          )?.completed_at,
        ).toBe(900);
        expect(
          connection.first<{ readonly active_step_id: string | null }>(
            'SELECT active_step_id FROM pattern_progress WHERE pattern_id = ?',
            ['pattern-gap'],
          )?.active_step_id,
        ).toBe('step-gap-1');

        // The untouched baseline came through byte-identically alongside it.
        expect(
          connection
            .all<{ readonly instruction: string }>(
              'SELECT instruction FROM pattern_step WHERE pattern_id = ? ORDER BY position ASC',
              [BASELINE.patterns[0].id],
            )
            .map((step) => step.instruction),
        ).toStrictEqual([
          'Chain 41',
          'Single crochet in each chain across',
          'Chain 1, turn, and repeat until 40 rows',
        ]);
      },
    );

    it('re-enables foreign-key enforcement even when the rebuild fails', () => {
      initializeDatabase(connection);
      insertPopulatedBaseline(connection);

      const failure = captureFailure(() => {
        initializeDatabase(connection, {
          migrations: [...MIGRATIONS, FAILING_REBUILD_MIGRATION],
        });
      });

      expect(failure).toBeInstanceOf(DatabaseError);
      const databaseError = failure as DatabaseError;
      expect(databaseError.code).toBe('migration-failed');
      expect(databaseError.failedVersion).toBe(LATEST_SCHEMA_VERSION + 1);
      expect(databaseError.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
      expect(databaseError.message).not.toContain('Sunrise Blanket');

      expect(schemaVersionOf(connection)).toBe(LATEST_SCHEMA_VERSION);
      expect(objectNames(connection, 'table')).toStrictEqual(EXPECTED_TABLES);
      expect(
        connection.first<{ readonly steps: number }>(
          'SELECT COUNT(*) AS steps FROM pattern_step',
        )?.steps,
      ).toBe(5);

      // Step 12 on the failure path. A build that re-enables only after a
      // successful commit leaves this at 0 and every later write in the session
      // unenforced.
      expect(foreignKeysEnabled(connection)).toBe(1);
    });

    it('refuses a rebuild that leaves a dangling reference behind', () => {
      initializeDatabase(connection);
      insertPopulatedBaseline(connection);

      const failure = captureFailure(() => {
        initializeDatabase(connection, {
          migrations: [...MIGRATIONS, ORPHANING_REBUILD_MIGRATION],
        });
      });

      const databaseError = failure as DatabaseError;
      expect(databaseError.code).toBe('migration-failed');
      expect(String((databaseError.cause as Error).message)).toContain(
        'foreign-key violation',
      );

      // Without the runner's `foreign_key_check`, this migration commits and
      // leaves `pattern_step_progress.step_id` pointing at a step that is gone.
      expect(schemaVersionOf(connection)).toBe(LATEST_SCHEMA_VERSION);
      expect(
        connection.first<{ readonly steps: number }>(
          'SELECT COUNT(*) AS steps FROM pattern_step',
        )?.steps,
      ).toBe(5);
      expect(
        connection.first<{ readonly rows: number }>(
          'SELECT COUNT(*) AS rows FROM pattern_step_progress',
        )?.rows,
      ).toBe(1);
      expect(foreignKeysEnabled(connection)).toBe(1);
    });

    it('refuses to rebuild at all when the disable pragma is silently ignored', () => {
      initializeDatabase(connection);
      insertPopulatedBaseline(connection);

      const failure = captureFailure(() => {
        initializeDatabase(swallowForeignKeyDisable(connection), {
          migrations: [...MIGRATIONS, REBUILD_PROBE_MIGRATION],
        });
      });

      const databaseError = failure as DatabaseError;
      expect(databaseError.code).toBe('migration-failed');
      expect(databaseError.failedVersion).toBe(LATEST_SCHEMA_VERSION + 1);

      // Nothing was rebuilt. Without the read-back the rebuild would have run
      // with enforcement still on and silently emptied `pattern_step_progress`.
      expect(schemaVersionOf(connection)).toBe(LATEST_SCHEMA_VERSION);
      expect(objectNames(connection, 'table')).toStrictEqual(EXPECTED_TABLES);
      expect(
        connection.first<{ readonly completed_at: number | null }>(
          'SELECT completed_at FROM pattern_step_progress WHERE step_id = ?',
          [BASELINE.completedStep.stepId],
        )?.completed_at,
      ).toBe(1_699_000_200_000);
      expect(foreignKeysEnabled(connection)).toBe(1);
    });

    /**
     * `foreignKeys: 'off'` is opt-in, and the opting-out half is a contract in
     * its own right: a migration that does not declare it must keep enforcement
     * **on** for its own statements, and must not pay `foreign_key_check`'s
     * full-database scan. Widening the runner's `migration.foreignKeys === 'off'`
     * to a constant `true` leaves every other suite in the repository green,
     * because nothing else observes which pragmas were issued.
     */
    it('touches neither pragma for a migration that does not ask for it', () => {
      initializeDatabase(connection);

      const issued: string[] = [];
      const recording: SqliteConnection = {
        ...connection,
        execute(sql) {
          issued.push(sql);
          connection.execute(sql);
        },
        all<Row>(sql: string, params?: readonly SqlValue[]) {
          issued.push(sql);

          return connection.all<Row>(sql, params);
        },
      };

      initializeDatabase(recording, {
        migrations: [...MIGRATIONS, ADD_COLUMN_MIGRATION],
      });

      expect(issued).not.toContain('PRAGMA foreign_keys = OFF');
      expect(issued).not.toContain('PRAGMA foreign_key_check');
      // The initializer's own enabling step still ran, as it does every launch.
      expect(issued).toContain('PRAGMA foreign_keys = ON');
    });

    it('issues both pragmas for a migration that does ask for it', () => {
      initializeDatabase(connection, {
        migrations: MIGRATIONS.filter((migration) => migration.version <= 2),
      });

      const issued: string[] = [];
      const recording: SqliteConnection = {
        ...connection,
        execute(sql) {
          issued.push(sql);
          connection.execute(sql);
        },
        all<Row>(sql: string, params?: readonly SqlValue[]) {
          issued.push(sql);

          return connection.all<Row>(sql, params);
        },
      };

      initializeDatabase(recording);

      expect(issued).toContain('PRAGMA foreign_keys = OFF');
      expect(issued).toContain('PRAGMA foreign_key_check');
      // Step 1 before BEGIN, step 12 after the commit.
      expect(issued.indexOf('PRAGMA foreign_keys = OFF')).toBeLessThan(
        issued.indexOf('BEGIN IMMEDIATE'),
      );
      expect(issued.lastIndexOf('PRAGMA foreign_keys = ON')).toBeGreaterThan(
        issued.indexOf('COMMIT'),
      );
    });

    it('reports an unrestorable connection rather than the migration failure', () => {
      initializeDatabase(connection, {
        migrations: MIGRATIONS.filter((migration) => migration.version <= 2),
      });
      insertPopulatedBaseline(connection);

      // Step 12 cannot put enforcement back. A connection left unenforced is a
      // worse condition than a failed migration, so it is what gets reported.
      const failure = captureFailure(() => {
        initializeDatabase(
          {
            ...connection,
            execute(sql) {
              if (sql === 'PRAGMA foreign_keys = ON') {
                return;
              }

              connection.execute(sql);
            },
          },
          { migrations: MIGRATIONS.filter((m) => m.version >= 3) },
        );
      });

      expect(failure).toBeInstanceOf(DatabaseError);
      expect((failure as DatabaseError).code).toBe('foreign-keys-unavailable');
    });

    it('applies nothing on the next launch after the rebuild', () => {
      initializeAtVersionTwo();
      insertPopulatedBaseline(connection);
      initializeDatabase(connection);

      expect(initializeDatabase(connection)).toStrictEqual({
        schemaVersion: 3,
        appliedMigrations: [],
      });
      expect(
        connection.first<{ readonly steps: number }>(
          'SELECT COUNT(*) AS steps FROM pattern_step',
        )?.steps,
      ).toBe(5);
      expect(
        connection.first<{ readonly steps: number }>(
          'SELECT COUNT(*) AS steps FROM guide_step',
        )?.steps,
      ).toBe(2);
      expect(foreignKeysEnabled(connection)).toBe(1);
    });
  });

  it('seeds the upgraded database below the maker\u2019s existing work', () => {
    initializeDatabase(connection, {
      migrations: MIGRATIONS.filter((migration) => migration.version === 1),
    });
    insertPopulatedBaseline(connection);
    initializeDatabase(connection);

    let instant = 1_800_000_000_000;
    let identifiers = 0;
    const repositories = createRepositories({
      connection,
      now: () => {
        instant += 1_000;

        return instant;
      },
      newId: () => {
        identifiers += 1;

        return `upgraded-id-${identifiers}`;
      },
    });

    expect(applyBundledPatternSeed(repositories.patterns)).toStrictEqual({
      status: 'applied',
      seedVersion: 1,
      inserted: 6,
      skipped: 0,
    });

    expect(
      repositories.patterns
        .listPatterns({ limit: 200, offset: 0 })
        .map((pattern) => [pattern.title, pattern.origin]),
    ).toStrictEqual([
      ['Tiny Hedgehog', 'user'],
      ['Sunrise Blanket', 'user'],
      ['Practice Swatch', 'bundled'],
      ['Cotton Dishcloth', 'bundled'],
      ['Ridged Coaster', 'bundled'],
      ['Granny Square', 'bundled'],
      ['Ribbed Headband', 'bundled'],
      ['Simple Scarf', 'bundled'],
    ]);
  });

  it('reports a failed migration, keeps the old version, and keeps every row', () => {
    initializeDatabase(connection);
    insertPopulatedBaseline(connection);

    const failure = captureFailure(() => {
      initializeDatabase(connection, {
        migrations: [...MIGRATIONS, FAILING_MIGRATION],
      });
    });

    expect(failure).toBeInstanceOf(DatabaseError);
    const databaseError = failure as DatabaseError;
    expect(databaseError.code).toBe('migration-failed');
    expect(databaseError.failedVersion).toBe(4);
    expect(databaseError.schemaVersion).toBe(3);
    expect(databaseError.cause).toBeDefined();
    expect(databaseError.message).not.toContain('Sunrise Blanket');

    // Neither the recorded version nor the migration's first statement survived.
    expect(schemaVersionOf(connection)).toBe(3);
    expect(objectNames(connection, 'table')).toStrictEqual(EXPECTED_TABLES);

    expect(
      connection
        .all<{ readonly title: string }>(
          'SELECT title FROM pattern ORDER BY created_at ASC',
        )
        .map((pattern) => pattern.title),
    ).toStrictEqual(['Sunrise Blanket', 'Tiny Hedgehog']);
    expect(
      connection.first<{ readonly steps: number }>(
        'SELECT COUNT(*) AS steps FROM pattern_step',
      )?.steps,
    ).toBe(5);
    expect(
      connection.first<{ readonly completed_at: number | null }>(
        'SELECT completed_at FROM pattern_step_progress WHERE step_id = ?',
        [BASELINE.completedStep.stepId],
      )?.completed_at,
    ).toBe(1_699_000_200_000);
    expect(
      connection.first<{ readonly active_step_id: string | null }>(
        'SELECT active_step_id FROM pattern_progress WHERE pattern_id = ?',
        [BASELINE.activeStep.patternId],
      )?.active_step_id,
    ).toBe('step-sunrise-1');
    expect(
      connection.first<{ readonly notes: string | null }>(
        'SELECT notes FROM imported_guide WHERE id = ?',
        [BASELINE.guide.id],
      )?.notes,
    ).toBe('Follow along slowly the first time');
    expect(
      connection.first<{ readonly value: number }>(
        'SELECT value FROM counter WHERE id = ?',
        [BASELINE.counter.id],
      )?.value,
    ).toBe(7);

    // Retrying after the failure resumes from the last good version.
    expect(initializeDatabase(connection)).toStrictEqual({
      schemaVersion: 3,
      appliedMigrations: [],
    });
  });

  it('records the schema version atomically with the statements it describes', () => {
    initializeDatabase(connection);

    const failure = captureFailure(() => {
      initializeDatabase(failingVersionWrite(connection), {
        migrations: [...MIGRATIONS, VERSION_PROBE_MIGRATION],
      });
    });

    expect((failure as DatabaseError).code).toBe('migration-failed');

    // A schema that outlived its unrecorded version would replay the migration
    // on the next launch and fail forever on the table it already created.
    expect(objectNames(connection, 'table')).toStrictEqual(EXPECTED_TABLES);
    expect(schemaVersionOf(connection)).toBe(3);
  });

  it('refuses a database newer than the app and changes nothing', () => {
    initializeDatabase(connection);
    insertPopulatedBaseline(connection);
    connection.execute('PRAGMA user_version = 999');

    const failure = captureFailure(() => {
      initializeDatabase(connection);
    });

    expect(failure).toBeInstanceOf(DatabaseError);
    const databaseError = failure as DatabaseError;
    expect(databaseError.code).toBe('unsupported-schema-version');
    expect(databaseError.schemaVersion).toBe(999);

    expect(schemaVersionOf(connection)).toBe(999);
    expect(objectNames(connection, 'table')).toStrictEqual(EXPECTED_TABLES);
    expect(
      connection.first<{ readonly value: number }>(
        'SELECT value FROM counter WHERE id = ?',
        [BASELINE.counter.id],
      )?.value,
    ).toBe(7);
  });
});
