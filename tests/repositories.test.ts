/** @jest-environment node */

import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  resolvePage,
} from '@/data/contracts/page';
import { applyBundledStitchSeed } from '@/data/seed/stitchSeed';
import { createRepositories } from '@/data/sqlite/createRepositories';
import { initializeDatabase } from '@/data/sqlite/initializeDatabase';
import type { SqliteConnection } from '@/data/sqlite/sqliteConnection';

import {
  BASELINE,
  insertPopulatedBaseline,
} from './support/populatedBaseline';
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

    it('rewrites details, clears omitted notes to NULL, and floats the pattern to the front of recency', () => {
      const { patterns } = database.repositories;
      const alpha = patterns.createPattern({
        title: 'Alpha',
        notes: 'first notes',
        steps: [],
      });
      const bravo = patterns.createPattern({ title: 'Bravo', steps: [] });

      // Bravo is newer, so recency is [Bravo, Alpha] before any edit.
      expect(patterns.listPatterns().map((pattern) => pattern.id)).toStrictEqual(
        [bravo.pattern.id, alpha.pattern.id],
      );

      const updated = patterns.updatePattern({
        id: alpha.pattern.id,
        title: 'Alpha renamed',
      });
      expect(updated.title).toBe('Alpha renamed');
      // Notes omitted from the input clear to SQL NULL.
      expect(updated.notes).toBeUndefined();

      // The edit bumps updated_at, so Alpha now leads; a no-touch write leaves
      // [Bravo, Alpha].
      expect(patterns.listPatterns().map((pattern) => pattern.id)).toStrictEqual(
        [alpha.pattern.id, bravo.pattern.id],
      );

      patterns.updatePattern({
        id: alpha.pattern.id,
        title: 'Alpha renamed',
        notes: 'new notes',
      });
      expect(
        patterns.getPatternWithSteps(alpha.pattern.id)?.pattern.notes,
      ).toBe('new notes');
    });

    it('refuses to update a pattern that does not exist', () => {
      expect(() =>
        database.repositories.patterns.updatePattern({
          id: 'no-such-pattern',
          title: 'Ghost',
        }),
      ).toThrow();
    });

    it('appends a new step at the next contiguous position', () => {
      const { patterns } = database.repositories;
      const created = patterns.createPattern({
        title: 'Growing',
        steps: ['One', 'Two', 'Three'],
      });

      const added = patterns.addStep(created.pattern.id, 'Four');
      expect(added.position).toBe(3);
      expect(added.instruction).toBe('Four');

      const steps = patterns.getPatternWithSteps(created.pattern.id)?.steps ?? [];
      expect(steps.map((step) => step.position)).toStrictEqual([0, 1, 2, 3]);
      expect(steps.map((step) => step.instruction)).toStrictEqual([
        'One',
        'Two',
        'Three',
        'Four',
      ]);
    });

    it('edits only the target step and floats its pattern to the front of recency', () => {
      const { patterns } = database.repositories;
      const alpha = patterns.createPattern({
        title: 'Alpha',
        steps: ['One', 'Two', 'Three'],
      });
      const bravo = patterns.createPattern({ title: 'Bravo', steps: [] });
      const [, second] = alpha.steps;

      patterns.editStep(second?.id ?? '', 'Two revised');

      expect(
        patterns
          .getPatternWithSteps(alpha.pattern.id)
          ?.steps.map((step) => step.instruction),
      ).toStrictEqual(['One', 'Two revised', 'Three']);
      // Editing a step is recent activity on its parent pattern.
      expect(patterns.listPatterns().map((pattern) => pattern.id)).toStrictEqual(
        [alpha.pattern.id, bravo.pattern.id],
      );
    });

    it('re-compacts positions after deleting a middle step so a later append cannot collide', () => {
      const { patterns } = database.repositories;
      const created = patterns.createPattern({
        title: 'Compact',
        steps: ['A', 'B', 'C', 'D'],
      });
      const [, bStep] = created.steps;

      patterns.deleteStep(bStep?.id ?? '');

      expect(
        patterns
          .getPatternWithSteps(created.pattern.id)
          ?.steps.map((step) => [step.instruction, step.position]),
      ).toStrictEqual([
        ['A', 0],
        ['C', 1],
        ['D', 2],
      ]);

      // A gap-leaving delete would leave positions [0, 2, 3]; appending at
      // count 3 would then collide with D's stale position 3.
      const added = patterns.addStep(created.pattern.id, 'E');
      expect(added.position).toBe(3);
      expect(
        patterns
          .getPatternWithSteps(created.pattern.id)
          ?.steps.map((step) => step.instruction),
      ).toStrictEqual(['A', 'C', 'D', 'E']);
    });

    it('clears the active-step pointer when its step is deleted, keeping other completion', () => {
      const { patterns, progress } = database.repositories;
      const created = patterns.createPattern({
        title: 'Active',
        steps: ['One', 'Two', 'Three'],
      });
      const [first, second, third] = created.steps;

      progress.setStepCompleted(first?.id ?? '', true);
      progress.setStepCompleted(third?.id ?? '', true);
      progress.setActiveStep(created.pattern.id, second?.id ?? null);

      patterns.deleteStep(second?.id ?? '');

      const after = progress.getProgress(created.pattern.id);
      expect(after.activeStepId).toBeUndefined();
      expect(after.completedStepIds).toStrictEqual([first?.id, third?.id]);
    });

    it('rolls back a failed deleteStep, leaving the step count and positions unchanged', () => {
      const created = database.repositories.patterns.createPattern({
        title: 'Rollback',
        steps: ['A', 'B', 'C', 'D'],
      });
      const [, bStep] = created.steps;

      const repositories = createRepositories({
        connection: failingAt(
          database.connection,
          'UPDATE pattern_step SET position',
          2,
        ),
        now: database.now,
        newId: database.newId,
      });

      expect(() =>
        repositories.patterns.deleteStep(bStep?.id ?? ''),
      ).toThrow('simulated write failure');

      expect(
        database.repositories.patterns
          .getPatternWithSteps(created.pattern.id)
          ?.steps.map((step) => [step.instruction, step.position]),
      ).toStrictEqual([
        ['A', 0],
        ['B', 1],
        ['C', 2],
        ['D', 3],
      ]);
    });

    it('persists every edit, addition, deletion, and reorder across a reopen with no migration', () => {
      const { patterns } = database.repositories;
      const created = patterns.createPattern({
        title: 'Draft',
        notes: 'version one',
        steps: ['One', 'Two', 'Three'],
      });
      const [first, second] = created.steps;

      patterns.updatePattern({
        id: created.pattern.id,
        title: 'Final',
        notes: 'version two',
      });
      patterns.addStep(created.pattern.id, 'Four');
      patterns.editStep(first?.id ?? '', 'One edited');
      patterns.deleteStep(second?.id ?? '');

      // Remaining: One edited(0), Three(1), Four(2). Reorder to Four first.
      const current =
        patterns.getPatternWithSteps(created.pattern.id)?.steps ?? [];
      patterns.reorderSteps(created.pattern.id, [
        current[2]?.id ?? '',
        current[0]?.id ?? '',
        current[1]?.id ?? '',
      ]);

      // Reopening applies no migration and reads the exact final state.
      expect(initializeDatabase(database.connection).appliedMigrations).toEqual(
        [],
      );
      const reopened = createRepositories({
        connection: database.connection,
        now: database.now,
        newId: database.newId,
      });
      const readBack = reopened.patterns.getPatternWithSteps(created.pattern.id);

      expect(readBack?.pattern.title).toBe('Final');
      expect(readBack?.pattern.notes).toBe('version two');
      expect(readBack?.steps.map((step) => step.instruction)).toStrictEqual([
        'Four',
        'One edited',
        'Three',
      ]);
      expect(readBack?.steps.map((step) => step.position)).toStrictEqual([
        0, 1, 2,
      ]);
    });

    it('operates on realistic existing data: reorder keeps completion, deleting the active step clears the pointer, and cascade removes the whole aggregate', () => {
      insertPopulatedBaseline(database.connection);
      const { patterns, progress, guides } = database.repositories;
      const sunrise = BASELINE.patterns[0];
      const [sunriseStep0, sunriseStep1, sunriseStep2] = sunrise.steps;

      // Reorder Sunrise's three steps; the completed first step stays completed.
      patterns.reorderSteps(sunrise.id, [
        sunriseStep2.id,
        sunriseStep0.id,
        sunriseStep1.id,
      ]);
      expect(
        patterns
          .getPatternWithSteps(sunrise.id)
          ?.steps.map((step) => [step.id, step.position]),
      ).toStrictEqual([
        ['step-sunrise-2', 0],
        ['step-sunrise-0', 1],
        ['step-sunrise-1', 2],
      ]);
      expect(progress.getProgress(sunrise.id).completedStepIds).toStrictEqual([
        'step-sunrise-0',
      ]);

      // Deleting the active step clears the pointer but keeps the completed step.
      patterns.deleteStep(sunriseStep1.id);
      const afterDelete = progress.getProgress(sunrise.id);
      expect(afterDelete.activeStepId).toBeUndefined();
      expect(afterDelete.completedStepIds).toStrictEqual(['step-sunrise-0']);

      // Deleting the pattern removes its steps, progress, and counter atomically.
      patterns.deletePattern(sunrise.id);
      expect(patterns.getPatternWithSteps(sunrise.id)).toBeUndefined();
      expect(
        database.connection.first<{ readonly total: number }>(
          'SELECT COUNT(*) AS total FROM pattern_step WHERE pattern_id = ?',
          [sunrise.id],
        )?.total,
      ).toBe(0);
      expect(
        database.connection.first<{ readonly total: number }>(
          'SELECT COUNT(*) AS total FROM counter WHERE id = ?',
          [BASELINE.counter.id],
        )?.total,
      ).toBe(0);

      // The other pattern and the imported guide are untouched.
      expect(
        patterns
          .getPatternWithSteps(BASELINE.patterns[1].id)
          ?.steps.map((step) => step.instruction),
      ).toStrictEqual(['Magic ring, 6 sc', 'Increase to 12 sc']);
      expect(guides.getGuideWithSteps(BASELINE.guide.id)?.guide.title).toBe(
        'Granny square basics',
      );
    });
  });

  describe('progress', () => {
    it('records completion and the active position, and reopens them', () => {
      const created = database.repositories.patterns.createPattern({
        title: 'Sunrise Blanket',
        steps: ['Chain 41', 'Single crochet across', 'Turn and repeat'],
      });
      const [first, second, third] = created.steps;

      // Completed out of order, so a read that echoed completion order instead
      // of step position would return them the other way round.
      database.repositories.progress.setStepCompleted(third?.id ?? '', true);
      database.repositories.progress.setStepCompleted(first?.id ?? '', true);
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

    it('refuses an active step that belongs to a different pattern', () => {
      const sunrise = database.repositories.patterns.createPattern({
        title: 'Sunrise Blanket',
        steps: ['Chain 41'],
      });
      const dusk = database.repositories.patterns.createPattern({
        title: 'Dusk Scarf',
        steps: ['Chain 22'],
      });
      const [sunriseStep] = sunrise.steps;
      const [duskStep] = dusk.steps;

      database.repositories.progress.setActiveStep(
        sunrise.pattern.id,
        sunriseStep?.id ?? null,
      );

      // A step from another pattern must not become this pattern's position.
      database.repositories.progress.setActiveStep(
        sunrise.pattern.id,
        duskStep?.id ?? null,
      );

      expect(
        database.repositories.progress.getProgress(sunrise.pattern.id)
          .activeStepId,
      ).toBe(sunriseStep?.id);
      expect(
        database.repositories.progress.getProgress(dusk.pattern.id).activeStepId,
      ).toBeUndefined();

      // A pattern with no recorded position stays empty rather than pointing
      // at a foreign step.
      database.repositories.progress.setActiveStep(
        dusk.pattern.id,
        sunriseStep?.id ?? null,
      );

      expect(
        database.repositories.progress.getProgress(dusk.pattern.id).activeStepId,
      ).toBeUndefined();
    });

    it('clears the active position without dropping completion', () => {
      const created = database.repositories.patterns.createPattern({
        title: 'Sunrise Blanket',
        steps: ['Chain 41', 'Single crochet across'],
      });
      const [first, second] = created.steps;

      database.repositories.progress.setStepCompleted(first?.id ?? '', true);
      database.repositories.progress.setActiveStep(
        created.pattern.id,
        second?.id ?? null,
      );
      database.repositories.progress.setActiveStep(created.pattern.id, null);

      expect(
        database.repositories.progress.getProgress(created.pattern.id),
      ).toStrictEqual({
        patternId: created.pattern.id,
        activeStepId: undefined,
        completedStepIds: [first?.id],
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

    it('reports no applied seed version until a release is imported', () => {
      expect(
        database.repositories.stitches.appliedSeedVersion(),
      ).toBeUndefined();

      database.connection.run(
        `INSERT INTO stitch (id, slug, name, abbreviation, difficulty, summary, ownership, created_at, updated_at)
         VALUES ('stitch-user', NULL, 'Swirl stitch', 'swrl', 'advanced', 'Mine alone', 'user', 1, 1)`,
      );

      // Maker-owned rows carry no seed version, so a database holding only their
      // stitches is still behind every release.
      expect(
        database.repositories.stitches.appliedSeedVersion(),
      ).toBeUndefined();
    });

    it('reports the highest imported seed version, not the lowest or the latest write', () => {
      database.repositories.stitches.upsertSeededStitches(1, seedOne);

      const edited = database.repositories.stitches
        .listStitches()
        .find((stitch) => stitch.slug === 'single-crochet');
      database.connection.run(
        'UPDATE stitch SET user_modified_at = ? WHERE id = ?',
        [1_699_000_000_000, edited?.id ?? ''],
      );

      database.repositories.stitches.upsertSeededStitches(3, [
        {
          slug: 'treble-crochet',
          name: 'Treble crochet',
          abbreviation: 'tr',
          difficulty: 'intermediate' as const,
          summary: 'Taller again',
          instructions: [{ instruction: 'Yarn over twice' }],
        },
      ]);
      database.repositories.stitches.upsertSeededStitches(2, [
        {
          slug: 'magic-ring',
          name: 'Magic ring',
          abbreviation: 'MR',
          difficulty: 'intermediate' as const,
          summary: 'A closed centre start',
          instructions: [{ instruction: 'Wrap the yarn twice' }],
        },
      ]);

      // The maker-edited row keeps seed version 1 forever, so a `MIN` would say
      // 1 and re-import on every launch; reading the newest write would say 2.
      expect(database.repositories.stitches.appliedSeedVersion()).toBe(3);
    });
  });

  describe('stitch search', () => {
    /** The twelve bundled records, applied exactly as launch applies them. */
    beforeEach(() => {
      applyBundledStitchSeed(database.repositories.stitches);
    });

    function slugsFor(query: string): (string | undefined)[] {
      return database.repositories.stitches
        .searchStitches(query)
        .map((stitch) => stitch.slug);
    }

    it('ignores surrounding whitespace and case and keeps browse order', () => {
      expect(slugsFor('  SINGLE  ')).toStrictEqual([
        'single-crochet-increase',
        'single-crochet',
        'single-crochet-two-together',
      ]);
    });

    it('matches an abbreviation as a whole token, never inside another', () => {
      // A `%dc%` implementation would also return half-double-crochet through
      // `hdc` and bury the stitch the maker actually typed.
      expect(slugsFor('DC')).toStrictEqual([
        'double-crochet',
        'double-crochet-two-together',
      ]);
    });

    it('matches a multi-word name across its internal space', () => {
      expect(slugsFor('single crochet')).toStrictEqual([
        'single-crochet-increase',
        'single-crochet',
        'single-crochet-two-together',
      ]);
    });

    it('restores the browse page for a blank or whitespace-only query', () => {
      const browse = database.repositories.stitches.listStitches();

      expect(browse).toHaveLength(12);
      expect(database.repositories.stitches.searchStitches('')).toStrictEqual(
        browse,
      );
      expect(
        database.repositories.stitches.searchStitches('   '),
      ).toStrictEqual(browse);
    });

    it('returns an empty result for an unmatched query rather than throwing', () => {
      expect(slugsFor('unicorn stitch')).toStrictEqual([]);
    });

    it('treats LIKE metacharacters as literal text', () => {
      // Unescaped, `%` and `_` would match every stitch instead of none.
      expect(slugsFor('%')).toStrictEqual([]);
      expect(slugsFor('_')).toStrictEqual([]);
    });

    it('pages search results and clamps an oversized window', () => {
      const first = database.repositories.stitches.searchStitches('s', {
        limit: 2,
        offset: 0,
      });
      const second = database.repositories.stitches.searchStitches('s', {
        limit: 2,
        offset: 2,
      });

      expect([...first, ...second].map((stitch) => stitch.slug)).toStrictEqual([
        'single-crochet-increase',
        'single-crochet',
        'single-crochet-two-together',
        'slip-stitch',
      ]);
      expect(
        first.some((stitch) =>
          second.some((other) => other.id === stitch.id),
        ),
      ).toBe(false);

      const all = jest.spyOn(database.connection, 'all');
      try {
        database.repositories.stitches.searchStitches('s', {
          limit: 5_000,
          offset: 0,
        });

        expect(all).toHaveBeenCalledWith(expect.stringContaining('LIKE'), [
          's%',
          '% s%',
          MAX_PAGE_LIMIT,
          0,
        ]);
      } finally {
        all.mockRestore();
      }
    });
  });
});
