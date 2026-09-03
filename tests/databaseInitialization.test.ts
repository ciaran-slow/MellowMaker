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
import type { SqliteConnection } from '@/data/sqlite/sqliteConnection';

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
      1, 2,
    ]);
  });

  it('creates the whole schema and turns on foreign-key enforcement', () => {
    expect(foreignKeysEnabled(connection)).toBe(0);

    const result = initializeDatabase(connection);

    expect(result).toStrictEqual({
      schemaVersion: 2,
      appliedMigrations: [1, 2],
    });
    expect(schemaVersionOf(connection)).toBe(2);
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

    expect(reopened).toStrictEqual({ schemaVersion: 2, appliedMigrations: [] });
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
      schemaVersion: 3,
      appliedMigrations: [1, 2, 3],
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

    expect(upgraded).toStrictEqual({ schemaVersion: 3, appliedMigrations: [3] });
    expect(schemaVersionOf(connection)).toBe(3);
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

  it('upgrades a populated version-1 database to version 2 without losing maker data', () => {
    // Migration 2 is the first real schema change in the repository, so the
    // fixture starts on the *previous* production schema rather than a synthetic
    // one. `insertPopulatedBaseline` names its columns explicitly, so it is
    // valid against version 1 and version 2 alike.
    initializeDatabase(connection, {
      migrations: MIGRATIONS.filter((migration) => migration.version === 1),
    });
    insertPopulatedBaseline(connection);

    const upgraded = initializeDatabase(connection);

    expect(upgraded).toStrictEqual({ schemaVersion: 2, appliedMigrations: [2] });
    expect(schemaVersionOf(connection)).toBe(2);
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
    expect(databaseError.failedVersion).toBe(3);
    expect(databaseError.schemaVersion).toBe(2);
    expect(databaseError.cause).toBeDefined();
    expect(databaseError.message).not.toContain('Sunrise Blanket');

    // Neither the recorded version nor the migration's first statement survived.
    expect(schemaVersionOf(connection)).toBe(2);
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
      schemaVersion: 2,
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
    expect(schemaVersionOf(connection)).toBe(2);
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
