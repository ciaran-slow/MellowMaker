/** @jest-environment node */

import type { SqliteConnection } from '@/data/sqlite/sqliteConnection';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

const INSERT_PATTERN =
  'INSERT INTO pattern (id, title, notes, created_at, updated_at) VALUES (?, ?, ?, 1, 1)';
const INSERT_STEP =
  'INSERT INTO pattern_step (id, pattern_id, position, instruction, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)';
const INSERT_STEP_PROGRESS =
  'INSERT INTO pattern_step_progress (step_id, pattern_id, completed_at, updated_at) VALUES (?, ?, ?, 1)';
const INSERT_PATTERN_PROGRESS =
  'INSERT INTO pattern_progress (pattern_id, active_step_id, updated_at) VALUES (?, ?, 1)';
const INSERT_GUIDE =
  'INSERT INTO imported_guide (id, video_id, source_url, title, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)';
const INSERT_GUIDE_STEP =
  'INSERT INTO guide_step (id, guide_id, position, instruction, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1)';
const INSERT_COUNTER = `INSERT INTO counter (id, owner_kind, pattern_id, guide_id, label, kind, value, position, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 'row', ?, ?, 1, 1)`;
const INSERT_STITCH = `INSERT INTO stitch (id, slug, name, abbreviation, difficulty, summary, ownership, seed_version, created_at, updated_at)
  VALUES (?, ?, ?, ?, 'beginner', 'A basic stitch', ?, ?, 1, 1)`;

function countOf(connection: SqliteConnection, sql: string, id: string): number {
  return (
    connection.first<{ readonly total: number }>(sql, [id])?.total ?? -1
  );
}

describe('PRD0 schema behaviour', () => {
  let database: TestDatabase;
  let connection: SqliteConnection;

  beforeEach(() => {
    database = createTestDatabase();
    connection = database.connection;

    connection.run(INSERT_PATTERN, ['pattern-a', 'Sunrise Blanket', 'Cotton']);
    connection.run(INSERT_STEP, ['step-a0', 'pattern-a', 0, 'Chain 41']);
    connection.run(INSERT_STEP, ['step-a1', 'pattern-a', 1, 'Single crochet']);
    connection.run(INSERT_STEP_PROGRESS, ['step-a0', 'pattern-a', 1_000]);
    connection.run(INSERT_PATTERN_PROGRESS, ['pattern-a', 'step-a1']);
    connection.run(INSERT_COUNTER, [
      'counter-a',
      'pattern',
      'pattern-a',
      null,
      'Rows',
      7,
      0,
    ]);

    connection.run(INSERT_GUIDE, [
      'guide-a',
      'video-a',
      'https://www.youtube.com/watch?v=video-a',
      'Granny square basics',
    ]);
    connection.run(INSERT_GUIDE_STEP, [
      'guide-step-a0',
      'guide-a',
      0,
      'Make a magic ring',
      'import',
    ]);
    connection.run(INSERT_COUNTER, [
      'counter-guide-a',
      'guide',
      null,
      'guide-a',
      'Rounds',
      3,
      0,
    ]);
  });

  afterEach(() => {
    database.close();
  });

  describe('foreign keys', () => {
    it('rejects every child row whose parent does not exist', () => {
      expect(() =>
        connection.run(INSERT_STEP, ['orphan', 'missing-pattern', 0, 'Chain 1']),
      ).toThrow();
      expect(() =>
        connection.run(INSERT_GUIDE_STEP, [
          'orphan',
          'missing-guide',
          0,
          'Chain 1',
          'user',
        ]),
      ).toThrow();
      expect(() =>
        connection.run(INSERT_COUNTER, [
          'orphan',
          'pattern',
          'missing-pattern',
          null,
          'Rows',
          0,
          1,
        ]),
      ).toThrow();
      expect(() =>
        connection.run(INSERT_STEP_PROGRESS, [
          'missing-step',
          'pattern-a',
          1_000,
        ]),
      ).toThrow();
      expect(() =>
        connection.run(INSERT_PATTERN_PROGRESS, [
          'missing-pattern',
          'step-a0',
        ]),
      ).toThrow();

      expect(
        countOf(
          connection,
          'SELECT COUNT(*) AS total FROM pattern_step WHERE id = ?',
          'orphan',
        ),
      ).toBe(0);
    });

    it('removes a pattern with its steps, progress, and counters', () => {
      connection.run('DELETE FROM pattern WHERE id = ?', ['pattern-a']);

      expect(
        countOf(
          connection,
          'SELECT COUNT(*) AS total FROM pattern_step WHERE pattern_id = ?',
          'pattern-a',
        ),
      ).toBe(0);
      expect(
        countOf(
          connection,
          'SELECT COUNT(*) AS total FROM pattern_step_progress WHERE pattern_id = ?',
          'pattern-a',
        ),
      ).toBe(0);
      expect(
        countOf(
          connection,
          'SELECT COUNT(*) AS total FROM pattern_progress WHERE pattern_id = ?',
          'pattern-a',
        ),
      ).toBe(0);
      expect(
        countOf(
          connection,
          'SELECT COUNT(*) AS total FROM counter WHERE pattern_id = ?',
          'pattern-a',
        ),
      ).toBe(0);

      // The guide side of the database is untouched.
      expect(
        countOf(
          connection,
          'SELECT COUNT(*) AS total FROM guide_step WHERE guide_id = ?',
          'guide-a',
        ),
      ).toBe(1);
    });

    it('removes a guide with its steps and counters', () => {
      connection.run('DELETE FROM imported_guide WHERE id = ?', ['guide-a']);

      expect(
        countOf(
          connection,
          'SELECT COUNT(*) AS total FROM guide_step WHERE guide_id = ?',
          'guide-a',
        ),
      ).toBe(0);
      expect(
        countOf(
          connection,
          'SELECT COUNT(*) AS total FROM counter WHERE guide_id = ?',
          'guide-a',
        ),
      ).toBe(0);
    });

    it('clears the active pointer when its step goes, keeping the progress row', () => {
      connection.run('DELETE FROM pattern_step WHERE id = ?', ['step-a1']);

      const progress = connection.first<{
        readonly active_step_id: string | null;
      }>('SELECT active_step_id FROM pattern_progress WHERE pattern_id = ?', [
        'pattern-a',
      ]);

      expect(progress).not.toBeUndefined();
      expect(progress?.active_step_id).toBeNull();
      expect(
        countOf(
          connection,
          'SELECT COUNT(*) AS total FROM pattern_step WHERE id = ?',
          'step-a1',
        ),
      ).toBe(0);
    });

    it('removes only the deleted step\u2019s completion row', () => {
      connection.run('DELETE FROM pattern_step WHERE id = ?', ['step-a0']);

      expect(
        countOf(
          connection,
          'SELECT COUNT(*) AS total FROM pattern_step_progress WHERE step_id = ?',
          'step-a0',
        ),
      ).toBe(0);
      expect(
        connection.first<{ readonly active_step_id: string | null }>(
          'SELECT active_step_id FROM pattern_progress WHERE pattern_id = ?',
          ['pattern-a'],
        )?.active_step_id,
      ).toBe('step-a1');
    });
  });

  describe('constraints', () => {
    it('keeps positions unique per parent and never negative', () => {
      expect(() =>
        connection.run(INSERT_STEP, ['step-a2', 'pattern-a', 1, 'Duplicate']),
      ).toThrow();
      expect(() =>
        connection.run(INSERT_STEP, ['step-a3', 'pattern-a', -1, 'Negative']),
      ).toThrow();
      expect(() =>
        connection.run(INSERT_GUIDE_STEP, [
          'guide-step-a1',
          'guide-a',
          0,
          'Duplicate',
          'import',
        ]),
      ).toThrow();
    });

    it('refuses a negative count and a counter with two owners', () => {
      expect(() =>
        connection.run(INSERT_COUNTER, [
          'counter-negative',
          'pattern',
          'pattern-a',
          null,
          'Rows',
          -1,
          1,
        ]),
      ).toThrow();
      expect(() =>
        connection.run(INSERT_COUNTER, [
          'counter-both',
          'pattern',
          'pattern-a',
          'guide-a',
          'Rows',
          0,
          2,
        ]),
      ).toThrow();
      expect(() =>
        connection.run(INSERT_COUNTER, [
          'counter-neither',
          'pattern',
          null,
          null,
          'Rows',
          0,
          3,
        ]),
      ).toThrow();
    });

    it('orders pattern and guide counters independently', () => {
      // Both owners may hold position 0 because unique indexes treat NULLs as distinct.
      expect(
        connection.first<{ readonly total: number }>(
          'SELECT COUNT(*) AS total FROM counter WHERE position = 0',
        )?.total,
      ).toBe(2);
    });

    it('makes a seeded stitch without provenance unrepresentable', () => {
      expect(() =>
        connection.run(INSERT_STITCH, [
          'stitch-bad',
          null,
          'Single crochet',
          'sc',
          'seed',
          1,
        ]),
      ).toThrow();
      expect(() =>
        connection.run(INSERT_STITCH, [
          'stitch-bad',
          'single-crochet',
          'Single crochet',
          'sc',
          'seed',
          null,
        ]),
      ).toThrow();

      connection.run(INSERT_STITCH, [
        'stitch-seed',
        'single-crochet',
        'Single crochet',
        'sc',
        'seed',
        1,
      ]);
      connection.run(INSERT_STITCH, [
        'stitch-user',
        null,
        'My swirl stitch',
        'swrl',
        'user',
        null,
      ]);

      expect(
        connection.first<{ readonly total: number }>(
          'SELECT COUNT(*) AS total FROM stitch',
        )?.total,
      ).toBe(2);
    });

    it('normalizes case and whitespace in the generated search column', () => {
      connection.run(INSERT_STITCH, [
        'stitch-search',
        'single-crochet',
        '  Single Crochet ',
        'SC',
        'seed',
        1,
      ]);

      expect(
        connection.first<{ readonly search_text: string }>(
          'SELECT search_text FROM stitch WHERE id = ?',
          ['stitch-search'],
        )?.search_text,
      ).toBe('single crochet sc');
    });

    it('rejects an unknown difficulty, ownership, counter kind, or step origin', () => {
      expect(() =>
        connection.run(
          `INSERT INTO stitch (id, slug, name, abbreviation, difficulty, summary, ownership, seed_version, created_at, updated_at)
           VALUES ('stitch-x', 'x', 'X', 'x', 'expert', 'A stitch', 'seed', 1, 1, 1)`,
        ),
      ).toThrow();
      expect(() =>
        connection.run(INSERT_GUIDE_STEP, [
          'guide-step-x',
          'guide-a',
          9,
          'Unknown origin',
          'robot',
        ]),
      ).toThrow();
      expect(() =>
        connection.run(
          `INSERT INTO counter (id, owner_kind, pattern_id, label, kind, value, position, created_at, updated_at)
           VALUES ('counter-x', 'pattern', 'pattern-a', 'Rows', 'shells', 0, 9, 1, 1)`,
        ),
      ).toThrow();
    });
  });
});
