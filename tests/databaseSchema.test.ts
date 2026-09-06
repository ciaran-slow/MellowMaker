/** @jest-environment node */

import type { SqliteConnection } from '@/data/sqlite/sqliteConnection';
import { EMPTY_INSTRUCTION_CONSTRAINTS } from '@/data/sqlite/writeErrors';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

const INSERT_PATTERN =
  'INSERT INTO pattern (id, title, notes, created_at, updated_at, origin) VALUES (?, ?, ?, 1, 1, ?)';
/** Names no `origin`, so the column default is what decides the provenance. */
const INSERT_PATTERN_WITHOUT_ORIGIN =
  'INSERT INTO pattern (id, title, notes, created_at, updated_at) VALUES (?, ?, ?, 1, 1)';
const INSERT_SEED_LEDGER_ROW =
  'INSERT INTO pattern_seed_state (slug, pattern_id, seed_version, seeded_at) VALUES (?, ?, 1, 1)';
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

    connection.run(INSERT_PATTERN, [
      'pattern-a',
      'Sunrise Blanket',
      'Cotton',
      'user',
    ]);
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

    it('rejects an unknown pattern origin and defaults an unnamed one to user', () => {
      expect(() =>
        connection.run(INSERT_PATTERN, [
          'pattern-robot',
          'Robot Blanket',
          null,
          'robot',
        ]),
      ).toThrow();

      connection.run(INSERT_PATTERN_WITHOUT_ORIGIN, [
        'pattern-legacy',
        'Legacy Blanket',
        null,
      ]);

      // This is the backfill migration 2 relies on: an existing maker pattern
      // that predates the column becomes `'user'` without being rewritten.
      expect(
        connection.first<{ readonly origin: string }>(
          'SELECT origin FROM pattern WHERE id = ?',
          ['pattern-legacy'],
        )?.origin,
      ).toBe('user');
    });

    it('keeps the seed ledger row as a tombstone when its pattern is deleted', () => {
      connection.run(INSERT_SEED_LEDGER_ROW, ['sunrise-slug', 'pattern-a']);

      connection.run('DELETE FROM pattern WHERE id = ?', ['pattern-a']);

      // The whole point of ON DELETE SET NULL here: the ledger outlives the
      // pattern, so the next launch cannot re-insert the slug. Everything else
      // owned by the pattern still cascades away.
      const tombstone = connection.first<{
        readonly slug: string;
        readonly pattern_id: string | null;
      }>('SELECT slug, pattern_id FROM pattern_seed_state WHERE slug = ?', [
        'sunrise-slug',
      ]);

      expect(tombstone?.slug).toBe('sunrise-slug');
      expect(tombstone?.pattern_id).toBeNull();
      for (const sql of [
        'SELECT COUNT(*) AS total FROM pattern_step WHERE pattern_id = ?',
        'SELECT COUNT(*) AS total FROM pattern_step_progress WHERE pattern_id = ?',
        'SELECT COUNT(*) AS total FROM pattern_progress WHERE pattern_id = ?',
        'SELECT COUNT(*) AS total FROM counter WHERE pattern_id = ?',
      ]) {
        expect(countOf(connection, sql, 'pattern-a')).toBe(0);
      }
    });

    it('refuses a seed ledger row pointing at no pattern at all', () => {
      expect(() =>
        connection.run(INSERT_SEED_LEDGER_ROW, [
          'orphan-slug',
          'missing-pattern',
        ]),
      ).toThrow();
      expect(
        countOf(
          connection,
          'SELECT COUNT(*) AS total FROM pattern_seed_state WHERE slug = ?',
          'orphan-slug',
        ),
      ).toBe(0);
    });

    /**
     * Everything in this describe is asserted at the connection, with no
     * repository method involved, because the whole point of issue #67 is that
     * the refusal lives in the schema rather than in whoever happened to write.
     */
    describe('the non-empty step-instruction floor (issue #67)', () => {
      const EMPTY_SHAPES: readonly (readonly [string, string])[] = [
        ['an empty string', ''],
        ['spaces', '   '],
        ['a tab', '\t'],
        ['a newline', '\n'],
        ['a non-breaking space', ' '],
        ['a byte-order mark', '﻿'],
      ];

      it('runs these cases against the rebuilt version-3 tables', () => {
        expect(database.schemaVersion).toBe(3);
      });

      it.each(EMPTY_SHAPES)(
        'refuses a pattern step whose instruction is %s',
        (_label, instruction) => {
          expect(() =>
            connection.run(INSERT_STEP, [
              'step-empty',
              'pattern-a',
              9,
              instruction,
            ]),
          ).toThrow(/pattern_step_instruction_not_empty/);
        },
      );

      it.each(EMPTY_SHAPES)(
        'refuses a guide step whose instruction is %s',
        (_label, instruction) => {
          expect(() =>
            connection.run(INSERT_GUIDE_STEP, [
              'guide-step-empty',
              'guide-a',
              9,
              instruction,
              'import',
            ]),
          ).toThrow(/guide_step_instruction_not_empty/);
        },
      );

      // The floor must not be "reject everything". `'​'` is the arm that
      // pins the subset rule: the schema's character set is a strict subset of
      // `String.prototype.trim()`'s, so it can never refuse a value the domain
      // layer accepts, and a zero-width space is trimmed by neither.
      it.each([
        ['real content', 'Chain 41'],
        ['content with surrounding spaces', ' Chain 41 '],
        ['a single digit', '0'],
        ['a single dash', '-'],
        ['a zero-width space', '​'],
      ])('accepts a step instruction that is %s', (_label, instruction) => {
        connection.run(INSERT_STEP, ['step-ok', 'pattern-a', 9, instruction]);
        connection.run(INSERT_GUIDE_STEP, [
          'guide-step-ok',
          'guide-a',
          9,
          instruction,
          'import',
        ]);

        expect(
          connection.first<{ readonly instruction: string }>(
            'SELECT instruction FROM pattern_step WHERE id = ?',
            ['step-ok'],
          )?.instruction,
          // Stored verbatim: the CHECK is a floor, not a trimmer.
        ).toBe(instruction);
        expect(
          connection.first<{ readonly instruction: string }>(
            'SELECT instruction FROM guide_step WHERE id = ?',
            ['guide-step-ok'],
          )?.instruction,
        ).toBe(instruction);
      });

      // A column CHECK applies to UPDATE as well as INSERT. A BEFORE INSERT
      // trigger — the rejected alternative — would pass the cases above and fail
      // this one.
      it('refuses an update that empties an existing instruction', () => {
        expect(() =>
          connection.run('UPDATE pattern_step SET instruction = ? WHERE id = ?', [
            '  ',
            'step-a0',
          ]),
        ).toThrow(/pattern_step_instruction_not_empty/);
        expect(() =>
          connection.run('UPDATE guide_step SET instruction = ? WHERE id = ?', [
            '\t',
            'guide-step-a0',
          ]),
        ).toThrow(/guide_step_instruction_not_empty/);

        expect(
          connection.first<{ readonly instruction: string }>(
            'SELECT instruction FROM pattern_step WHERE id = ?',
            ['step-a0'],
          )?.instruction,
        ).toBe('Chain 41');
        expect(
          connection.first<{ readonly instruction: string }>(
            'SELECT instruction FROM guide_step WHERE id = ?',
            ['guide-step-a0'],
          )?.instruction,
        ).toBe('Make a magic ring');
      });

      it('still refuses a NULL instruction, which NOT NULL owns', () => {
        expect(() =>
          connection.run(INSERT_STEP, ['step-null', 'pattern-a', 9, null]),
        ).toThrow(/NOT NULL/);
      });

      /**
       * The mapper in `src/data/sqlite/writeErrors.ts` keeps a hand-written list
       * of constraint names, which is the enumeration-guard shape: a migration
       * that gives a **third** table an `instruction_not_empty` constraint would
       * leave its refusal reaching the maker as a raw SQLite error rather than
       * `DatabaseError('empty-step-instruction')`, and nothing would say so.
       *
       * So the list is walked against the schema the app actually builds rather
       * than trusted. `sqlite_master` is the widest carrier available — it holds
       * whatever DDL any migration wrote, including one this test predates — so
       * a new constraint cannot escape by being declared somewhere this test
       * does not think to look.
       */
      it('maps every non-empty instruction CHECK the built schema can raise', () => {
        const declared = connection
          .all<{ readonly sql: string | null }>(
            "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL",
          )
          .flatMap((row) => [
            ...(row.sql ?? '').matchAll(
              /CONSTRAINT\s+([A-Za-z_][A-Za-z0-9_]*_instruction_not_empty)\b/g,
            ),
          ])
          .map((match) => match[1]);

        expect([...new Set(declared)].sort()).toStrictEqual(
          [...EMPTY_INSTRUCTION_CONSTRAINTS].sort(),
        );
      });
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
