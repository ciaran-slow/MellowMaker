/** @jest-environment node */

import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  resolvePage,
} from '@/data/contracts/page';
import { createRepositories } from '@/data/sqlite/createRepositories';
import { initializeDatabase } from '@/data/sqlite/initializeDatabase';
import type { SqliteConnection } from '@/data/sqlite/sqliteConnection';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

/**
 * Delegates every call but fails the nth statement containing `sqlFragment`, the
 * way a constraint violation or a full disk would mid-write.
 */
function failingAt(
  connection: SqliteConnection,
  sqlFragment: string,
  failOnCall: number,
): SqliteConnection {
  let seen = 0;

  return {
    ...connection,
    run(sql, params) {
      if (sql.includes(sqlFragment)) {
        seen += 1;
        if (seen === failOnCall) {
          throw new Error('simulated write failure');
        }
      }

      connection.run(sql, params);
    },
  };
}

describe('SQLite repositories', () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = createTestDatabase();
  });

  afterEach(() => {
    database.close();
  });

  describe('page bounds', () => {
    it('defaults and caps every list read', () => {
      expect(resolvePage()).toStrictEqual({
        limit: DEFAULT_PAGE_LIMIT,
        offset: 0,
      });
      expect(resolvePage({ limit: 5_000, offset: -3 })).toStrictEqual({
        limit: MAX_PAGE_LIMIT,
        offset: 0,
      });
      expect(resolvePage({ limit: 0, offset: 10 })).toStrictEqual({
        limit: 1,
        offset: 10,
      });
    });
  });

  describe('patterns', () => {
    it('writes a pattern and its steps in the requested order', () => {
      const created = database.repositories.patterns.createPattern({
        title: 'Sunrise Blanket',
        notes: 'Hook 5.0 mm',
        steps: ['Chain 41', 'Single crochet across', 'Turn and repeat'],
      });

      expect(created.pattern.title).toBe('Sunrise Blanket');
      expect(created.pattern.notes).toBe('Hook 5.0 mm');
      expect(created.steps.map((step) => step.instruction)).toStrictEqual([
        'Chain 41',
        'Single crochet across',
        'Turn and repeat',
      ]);
      expect(created.steps.map((step) => step.position)).toStrictEqual([
        0, 1, 2,
      ]);

      // Reopening the database applies no migration and reads the same order.
      expect(initializeDatabase(database.connection).appliedMigrations).toEqual(
        [],
      );
      const reopened = createRepositories({
        connection: database.connection,
        now: database.now,
        newId: database.newId,
      });

      expect(
        reopened.patterns
          .getPatternWithSteps(created.pattern.id)
          ?.steps.map((step) => step.instruction),
      ).toStrictEqual([
        'Chain 41',
        'Single crochet across',
        'Turn and repeat',
      ]);
    });

    it('leaves nothing behind when a step write fails part way', () => {
      const repositories = createRepositories({
        connection: failingAt(database.connection, 'INSERT INTO pattern_step', 3),
        now: database.now,
        newId: database.newId,
      });

      expect(() =>
        repositories.patterns.createPattern({
          title: 'Doomed Blanket',
          steps: ['Chain 41', 'Single crochet across', 'Turn and repeat'],
        }),
      ).toThrow('simulated write failure');

      expect(
        database.connection.first<{ readonly total: number }>(
          'SELECT COUNT(*) AS total FROM pattern',
        )?.total,
      ).toBe(0);
      expect(
        database.connection.first<{ readonly total: number }>(
          'SELECT COUNT(*) AS total FROM pattern_step',
        )?.total,
      ).toBe(0);
    });

    it('lists patterns by recency and honours the requested window', () => {
      const first = database.repositories.patterns.createPattern({
        title: 'First',
        steps: [],
      });
      const second = database.repositories.patterns.createPattern({
        title: 'Second',
        steps: [],
      });
      const third = database.repositories.patterns.createPattern({
        title: 'Third',
        steps: [],
      });

      expect(
        database.repositories.patterns
          .listPatterns()
          .map((pattern) => pattern.id),
      ).toStrictEqual([third.pattern.id, second.pattern.id, first.pattern.id]);
      expect(
        database.repositories.patterns
          .listPatterns({ limit: 1, offset: 1 })
          .map((pattern) => pattern.title),
      ).toStrictEqual(['Second']);
    });

    it('stores maker text exactly, including SQL punctuation', () => {
      const hostileTitle = "Robert'); DROP TABLE pattern;--";
      const awkwardStep = '100% wool _ 50%\ncotton';

      const created = database.repositories.patterns.createPattern({
        title: hostileTitle,
        notes: awkwardStep,
        steps: [awkwardStep],
      });
      const readBack = database.repositories.patterns.getPatternWithSteps(
        created.pattern.id,
      );

      expect(readBack?.pattern.title).toBe(hostileTitle);
      expect(readBack?.pattern.notes).toBe(awkwardStep);
      expect(readBack?.steps[0]?.instruction).toBe(awkwardStep);
      expect(
        database.connection.first<{ readonly total: number }>(
          'SELECT COUNT(*) AS total FROM pattern',
        )?.total,
      ).toBe(1);
    });

    it('reorders steps to exact contiguous positions and is idempotent', () => {
      const created = database.repositories.patterns.createPattern({
        title: 'Reorder me',
        steps: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
      });
      const [alpha, bravo, charlie, delta] = created.steps;
      const requested = [
        charlie?.id ?? '',
        alpha?.id ?? '',
        delta?.id ?? '',
        bravo?.id ?? '',
      ];

      database.repositories.patterns.reorderSteps(created.pattern.id, requested);

      const afterFirst = database.repositories.patterns.getPatternWithSteps(
        created.pattern.id,
      );
      expect(
        afterFirst?.steps.map((step) => [step.instruction, step.position]),
      ).toStrictEqual([
        ['Charlie', 0],
        ['Alpha', 1],
        ['Delta', 2],
        ['Bravo', 3],
      ]);

      database.repositories.patterns.reorderSteps(created.pattern.id, requested);

      expect(
        database.repositories.patterns
          .getPatternWithSteps(created.pattern.id)
          ?.steps.map((step) => step.instruction),
      ).toStrictEqual(['Charlie', 'Alpha', 'Delta', 'Bravo']);
    });

    it('refuses a reorder that does not list the pattern\u2019s steps once each', () => {
      const created = database.repositories.patterns.createPattern({
        title: 'Reorder me',
        steps: ['Alpha', 'Bravo'],
      });
      const [alpha] = created.steps;

      expect(() =>
        database.repositories.patterns.reorderSteps(created.pattern.id, [
          alpha?.id ?? '',
        ]),
      ).toThrow(/exactly once/);
      expect(() =>
        database.repositories.patterns.reorderSteps(created.pattern.id, [
          alpha?.id ?? '',
          alpha?.id ?? '',
        ]),
      ).toThrow(/exactly once/);

      expect(
        database.repositories.patterns
          .getPatternWithSteps(created.pattern.id)
          ?.steps.map((step) => step.instruction),
      ).toStrictEqual(['Alpha', 'Bravo']);
    });
  });

  describe('progress', () => {
    it('records completion and the active position, and reopens them', () => {
      const created = database.repositories.patterns.createPattern({
        title: 'Sunrise Blanket',
        steps: ['Chain 41', 'Single crochet across', 'Turn and repeat'],
      });
      const [first, second, third] = created.steps;

      database.repositories.progress.setStepCompleted(first?.id ?? '', true);
      database.repositories.progress.setStepCompleted(third?.id ?? '', true);
      database.repositories.progress.setActiveStep(
        created.pattern.id,
        second?.id ?? null,
      );

      expect(
        database.repositories.progress.getProgress(created.pattern.id),
      ).toStrictEqual({
        patternId: created.pattern.id,
        activeStepId: second?.id,
        completedStepIds: [first?.id, third?.id],
      });

      // Reopening a step clears its completion without touching the others.
      database.repositories.progress.setStepCompleted(first?.id ?? '', false);

      expect(
        database.repositories.progress.getProgress(created.pattern.id)
          .completedStepIds,
      ).toStrictEqual([third?.id]);

      // Repeating the same completion is not additive.
      database.repositories.progress.setStepCompleted(third?.id ?? '', true);
      database.repositories.progress.setStepCompleted(third?.id ?? '', true);

      expect(
        database.repositories.progress.getProgress(created.pattern.id)
          .completedStepIds,
      ).toStrictEqual([third?.id]);
    });

    it('reports empty progress for a pattern that has none', () => {
      const created = database.repositories.patterns.createPattern({
        title: 'Untouched',
        steps: ['Chain 41'],
      });

      expect(
        database.repositories.progress.getProgress(created.pattern.id),
      ).toStrictEqual({
        patternId: created.pattern.id,
        activeStepId: undefined,
        completedStepIds: [],
      });
    });
  });

  describe('counters', () => {
    it('clamps at zero, counts every tap, and stays with its owner', () => {
      const patternA = database.repositories.patterns.createPattern({
        title: 'Pattern A',
        steps: [],
      });
      const patternB = database.repositories.patterns.createPattern({
        title: 'Pattern B',
        steps: [],
      });

      const counter = database.repositories.counters.createCounter({
        owner: { kind: 'pattern', id: patternA.pattern.id },
        label: 'Rows',
        kind: 'row',
      });

      expect(counter.value).toBe(0);
      expect(counter.position).toBe(0);
      expect(database.repositories.counters.adjustCounter(counter.id, -3).value).toBe(0);
      expect(database.repositories.counters.adjustCounter(counter.id, 5).value).toBe(5);
      expect(database.repositories.counters.adjustCounter(counter.id, -2).value).toBe(3);

      for (let tap = 0; tap < 50; tap += 1) {
        database.repositories.counters.adjustCounter(counter.id, 1);
      }

      expect(
        database.repositories.counters
          .listCounters({ kind: 'pattern', id: patternA.pattern.id })
          .map((entry) => entry.value),
      ).toStrictEqual([53]);
      expect(
        database.repositories.counters.resetCounter(counter.id).value,
      ).toBe(0);
      expect(
        database.repositories.counters.listCounters({
          kind: 'pattern',
          id: patternB.pattern.id,
        }),
      ).toStrictEqual([]);
    });

    it('positions each owner\u2019s counters independently', () => {
      const pattern = database.repositories.patterns.createPattern({
        title: 'Pattern A',
        steps: [],
      });
      const guide = database.repositories.guides.saveImportedGuide({
        guide: {
          videoId: 'video-a',
          sourceUrl: 'https://www.youtube.com/watch?v=video-a',
          title: 'Granny square basics',
        },
        steps: [],
      });

      const rows = database.repositories.counters.createCounter({
        owner: { kind: 'pattern', id: pattern.pattern.id },
        label: 'Rows',
        kind: 'row',
      });
      const stitches = database.repositories.counters.createCounter({
        owner: { kind: 'pattern', id: pattern.pattern.id },
        label: 'Stitches',
        kind: 'stitch',
        initialValue: 12,
      });
      const rounds = database.repositories.counters.createCounter({
        owner: { kind: 'guide', id: guide.guide.id },
        label: 'Rounds',
        kind: 'custom',
      });

      expect([rows.position, stitches.position, rounds.position]).toStrictEqual([
        0, 1, 0,
      ]);
      expect(stitches.value).toBe(12);
      expect(
        database.repositories.counters
          .listCounters({ kind: 'pattern', id: pattern.pattern.id })
          .map((entry) => entry.label),
      ).toStrictEqual(['Rows', 'Stitches']);
      expect(
        database.repositories.counters
          .listCounters({ kind: 'guide', id: guide.guide.id })
          .map((entry) => entry.owner),
      ).toStrictEqual([{ kind: 'guide', id: guide.guide.id }]);
    });

    it('removes a pattern\u2019s counters with the pattern', () => {
      const pattern = database.repositories.patterns.createPattern({
        title: 'Pattern A',
        steps: [],
      });
      database.repositories.counters.createCounter({
        owner: { kind: 'pattern', id: pattern.pattern.id },
        label: 'Rows',
        kind: 'row',
      });

      database.repositories.patterns.deletePattern(pattern.pattern.id);

      expect(
        database.repositories.counters.listCounters({
          kind: 'pattern',
          id: pattern.pattern.id,
        }),
      ).toStrictEqual([]);
      expect(
        database.repositories.patterns.getPatternWithSteps(pattern.pattern.id),
      ).toBeUndefined();
    });
  });

  describe('guides', () => {
    it('saves a guide with its steps and finds it by video identity', () => {
      const saved = database.repositories.guides.saveImportedGuide({
        guide: {
          videoId: 'video-a',
          sourceUrl: 'https://www.youtube.com/watch?v=video-a',
          title: 'Granny square basics',
          creator: 'Mellow Makes',
          notes: 'Slowly the first time',
          metadataSyncedAt: 1_699_000_700_000,
        },
        steps: [
          {
            instruction: 'Make a magic ring',
            videoOffsetMs: 42_000,
            origin: 'import',
          },
          { instruction: 'Chain three', origin: 'user' },
        ],
      });

      expect(saved.guide.creator).toBe('Mellow Makes');
      expect(saved.guide.thumbnailUrl).toBeUndefined();
      expect(saved.steps.map((step) => step.origin)).toStrictEqual([
        'import',
        'user',
      ]);
      expect(saved.steps[0]?.videoOffsetMs).toBe(42_000);
      expect(saved.steps[1]?.videoOffsetMs).toBeUndefined();

      expect(
        database.repositories.guides.findGuideByVideoId('video-a')?.guide.id,
      ).toBe(saved.guide.id);
      expect(
        database.repositories.guides.findGuideByVideoId('video-missing'),
      ).toBeUndefined();

      database.repositories.guides.deleteGuide(saved.guide.id);

      expect(
        database.repositories.guides.getGuideWithSteps(saved.guide.id),
      ).toBeUndefined();
      expect(
        database.connection.first<{ readonly total: number }>(
          'SELECT COUNT(*) AS total FROM guide_step',
        )?.total,
      ).toBe(0);
    });

    it('saves no partial guide when a step write fails', () => {
      const repositories = createRepositories({
        connection: failingAt(database.connection, 'INSERT INTO guide_step', 2),
        now: database.now,
        newId: database.newId,
      });

      expect(() =>
        repositories.guides.saveImportedGuide({
          guide: {
            videoId: 'video-a',
            sourceUrl: 'https://www.youtube.com/watch?v=video-a',
            title: 'Granny square basics',
          },
          steps: [
            { instruction: 'Make a magic ring', origin: 'import' },
            { instruction: 'Chain three', origin: 'import' },
          ],
        }),
      ).toThrow('simulated write failure');

      expect(
        database.repositories.guides.findGuideByVideoId('video-a'),
      ).toBeUndefined();
      expect(
        database.connection.first<{ readonly total: number }>(
          'SELECT COUNT(*) AS total FROM guide_step',
        )?.total,
      ).toBe(0);
    });
  });

  describe('seeded stitches', () => {
    const seedOne = [
      {
        slug: 'single-crochet',
        name: 'Single crochet',
        abbreviation: 'sc',
        difficulty: 'beginner' as const,
        summary: 'The everyday stitch',
        instructions: [{ instruction: 'Insert hook, yarn over, pull through' }],
      },
      {
        slug: 'double-crochet',
        name: 'Double crochet',
        abbreviation: 'dc',
        difficulty: 'beginner' as const,
        summary: 'A taller stitch',
        instructions: [{ instruction: 'Yarn over, insert hook' }],
      },
    ];

    it('updates untouched seed rows and never overwrites maker work', () => {
      expect(
        database.repositories.stitches.upsertSeededStitches(1, seedOne),
      ).toStrictEqual({ inserted: 2, updated: 0, skipped: 0 });

      const single = database.repositories.stitches
        .listStitches()
        .find((stitch) => stitch.slug === 'single-crochet');
      expect(single).toBeDefined();

      // The maker edits the seeded single crochet and adds their own stitch.
      database.connection.run(
        'UPDATE stitch SET summary = ?, user_modified_at = ? WHERE id = ?',
        ['My own words for it', 1_699_000_000_000, single?.id ?? ''],
      );
      database.connection.run(
        `INSERT INTO stitch (id, slug, name, abbreviation, difficulty, summary, ownership, created_at, updated_at)
         VALUES ('stitch-user', NULL, 'Swirl stitch', 'swrl', 'advanced', 'Mine alone', 'user', 1, 1)`,
      );

      const seedTwo = [
        ...seedOne.map((record) => ({
          ...record,
          summary: `${record.summary}, revised`,
          instructions: [{ instruction: 'Revised instruction' }],
        })),
        {
          slug: 'treble-crochet',
          name: 'Treble crochet',
          abbreviation: 'tr',
          difficulty: 'intermediate' as const,
          summary: 'Taller again',
          instructions: [{ instruction: 'Yarn over twice' }],
        },
      ];

      expect(
        database.repositories.stitches.upsertSeededStitches(2, seedTwo),
      ).toStrictEqual({ inserted: 1, updated: 1, skipped: 1 });

      const editedDetail = database.repositories.stitches.getStitchDetail(
        single?.id ?? '',
      );
      expect(editedDetail?.summary).toBe('My own words for it');
      expect(editedDetail?.seedVersion).toBe(1);
      expect(editedDetail?.userModifiedAt).toBe(1_699_000_000_000);
      expect(
        editedDetail?.instructions.map((step) => step.instruction),
      ).toStrictEqual(['Insert hook, yarn over, pull through']);

      expect(
        database.repositories.stitches
          .listStitches()
          .map((stitch) => [stitch.name, stitch.ownership, stitch.summary]),
      ).toStrictEqual([
        ['Double crochet', 'seed', 'A taller stitch, revised'],
        ['Single crochet', 'seed', 'My own words for it'],
        ['Swirl stitch', 'user', 'Mine alone'],
        ['Treble crochet', 'seed', 'Taller again'],
      ]);
    });

    it('replaces the instructions of an updated seed row without duplicating them', () => {
      database.repositories.stitches.upsertSeededStitches(1, [
        {
          ...(seedOne[0] ?? seedOne[1]!),
          instructions: [{ instruction: 'One' }, { instruction: 'Two' }],
        },
      ]);
      database.repositories.stitches.upsertSeededStitches(2, [
        {
          ...(seedOne[0] ?? seedOne[1]!),
          instructions: [{ instruction: 'Only step', imageAssetKey: 'sc-1' }],
        },
      ]);

      const stitch = database.repositories.stitches
        .listStitches()
        .find((entry) => entry.slug === 'single-crochet');
      const detail = database.repositories.stitches.getStitchDetail(
        stitch?.id ?? '',
      );

      expect(detail?.instructions).toStrictEqual([
        {
          id: expect.any(String),
          position: 0,
          instruction: 'Only step',
          imageAssetKey: 'sc-1',
        },
      ]);
      expect(detail?.seedVersion).toBe(2);
    });
  });
});
