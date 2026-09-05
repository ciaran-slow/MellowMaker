/** @jest-environment node */

import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  resolvePage,
} from '@/data/contracts/page';
import { applyBundledPatternSeed } from '@/data/seed/patternSeed';
import { guidePatternSnapshot } from '@/domain/guides/guidePatternSnapshot';
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

    it('marks a created pattern as the maker\u2019s own and reports origin on every read', () => {
      const { patterns } = database.repositories;
      const created = patterns.createPattern({
        title: 'Meadow Wrap',
        steps: ['Chain 41'],
      });

      expect(created.pattern.origin).toBe('user');
      expect(
        patterns.getPatternWithSteps(created.pattern.id)?.pattern.origin,
      ).toBe('user');
      expect(patterns.listPatterns().map((pattern) => pattern.origin)).toStrictEqual(
        ['user'],
      );
    });

    it('works a bundled pattern exactly like a maker\u2019s own, end to end', () => {
      const { patterns, progress, counters } = database.repositories;
      applyBundledPatternSeed(patterns);

      const grannySquareId =
        database.connection.first<{ readonly pattern_id: string }>(
          'SELECT pattern_id FROM pattern_seed_state WHERE slug = ?',
          ['granny-square'],
        )?.pattern_id ?? '';
      expect(grannySquareId).not.toBe('');

      const seeded = patterns.getPatternWithSteps(grannySquareId);
      expect(seeded?.pattern.origin).toBe('bundled');
      expect(seeded?.steps).toHaveLength(7);

      // Edit: append, rewrite, delete (positions re-compact), reorder.
      const appended = patterns.addStep(grannySquareId, 'Block it damp');
      expect(appended.position).toBe(7);
      patterns.editStep(seeded?.steps[0]?.id ?? '', 'Chain 4 and join');
      patterns.deleteStep(seeded?.steps[1]?.id ?? '');

      const afterDelete =
        patterns.getPatternWithSteps(grannySquareId)?.steps ?? [];
      expect(afterDelete.map((step) => step.position)).toStrictEqual([
        0, 1, 2, 3, 4, 5, 6,
      ]);

      patterns.reorderSteps(grannySquareId, [
        afterDelete[6]?.id ?? '',
        ...afterDelete.slice(0, 6).map((step) => step.id),
      ]);
      patterns.updatePattern({
        id: grannySquareId,
        title: 'My Granny Square',
        notes: 'Using the leftover pink',
      });

      // A bundled pattern the maker touched floats to the front of recency like
      // any other, so `origin` grants the seed nothing at the read layer either.
      expect(patterns.listPatterns()[0]?.title).toBe('My Granny Square');
      expect(patterns.listPatterns()[0]?.origin).toBe('bundled');

      // Progress and the counter behave identically.
      const reordered =
        patterns.getPatternWithSteps(grannySquareId)?.steps ?? [];
      progress.setStepCompleted(reordered[0]?.id ?? '', true);
      const counter = counters.getOrCreatePrimaryCounter({
        kind: 'pattern',
        id: grannySquareId,
      });
      counters.adjustCounter(counter.id, 3);

      // Reopen over the same connection with no migration applied.
      expect(initializeDatabase(database.connection).appliedMigrations).toEqual(
        [],
      );
      const reopened = createRepositories({
        connection: database.connection,
        now: database.now,
        newId: database.newId,
      });
      const readBack = reopened.patterns.getPatternWithSteps(grannySquareId);

      expect(readBack?.pattern.title).toBe('My Granny Square');
      expect(readBack?.pattern.notes).toBe('Using the leftover pink');
      expect(readBack?.pattern.origin).toBe('bundled');
      expect(readBack?.steps.map((step) => step.id)).toStrictEqual(
        reordered.map((step) => step.id),
      );
      expect(readBack?.steps.map((step) => step.position)).toStrictEqual([
        0, 1, 2, 3, 4, 5, 6,
      ]);
      expect(readBack?.steps[0]?.instruction).toBe('Block it damp');
      expect(
        reopened.progress.getProgress(grannySquareId).completedStepIds,
      ).toStrictEqual([reordered[0]?.id]);
      expect(
        reopened.counters.getOrCreatePrimaryCounter({
          kind: 'pattern',
          id: grannySquareId,
        }).value,
      ).toBe(3);

      // Deleting it cascades the whole aggregate away but leaves the ledger
      // tombstone standing, so the seed can never bring it back.
      reopened.patterns.deletePattern(grannySquareId);

      expect(
        reopened.patterns.getPatternWithSteps(grannySquareId),
      ).toBeUndefined();
      for (const sql of [
        'SELECT COUNT(*) AS total FROM pattern_step WHERE pattern_id = ?',
        'SELECT COUNT(*) AS total FROM pattern_step_progress WHERE pattern_id = ?',
        'SELECT COUNT(*) AS total FROM pattern_progress WHERE pattern_id = ?',
        'SELECT COUNT(*) AS total FROM counter WHERE pattern_id = ?',
      ]) {
        expect(
          database.connection.first<{ readonly total: number }>(sql, [
            grannySquareId,
          ])?.total,
        ).toBe(0);
      }
      expect(
        database.connection.first<{ readonly pattern_id: string | null }>(
          'SELECT pattern_id FROM pattern_seed_state WHERE slug = ?',
          ['granny-square'],
        )?.pattern_id,
      ).toBeNull();
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

    it('lands on the exact final set after rapid interleaved completions', () => {
      const created = database.repositories.patterns.createPattern({
        title: 'Interleave',
        steps: ['s0', 's1', 's2', 's3', 's4'],
      });
      const [s0, s1, s2, s3, s4] = created.steps;
      const { progress } = database.repositories;

      // Issued in this exact order. The final set is authored by hand from the
      // sequence, not derived from the repository, so a non-serialized or
      // additive implementation fails: additive completion would keep s2/s0/s4
      // after they are reopened; an echo-by-completion-order read would return
      // [s3, s1] rather than position order [s1, s3].
      progress.setStepCompleted(s2?.id ?? '', true);
      progress.setStepCompleted(s3?.id ?? '', true);
      progress.setStepCompleted(s2?.id ?? '', true);
      progress.setStepCompleted(s4?.id ?? '', true);
      progress.setStepCompleted(s0?.id ?? '', true);
      progress.setStepCompleted(s4?.id ?? '', false);
      progress.setStepCompleted(s1?.id ?? '', true);
      progress.setStepCompleted(s2?.id ?? '', false);
      progress.setStepCompleted(s0?.id ?? '', false);

      expect(
        progress.getProgress(created.pattern.id).completedStepIds,
      ).toStrictEqual([s1?.id, s3?.id]);
    });

    it('makes a completion visible immediately, with no lingering transaction', () => {
      const created = database.repositories.patterns.createPattern({
        title: 'Immediate',
        steps: ['s0', 's1'],
      });
      const [first] = created.steps;

      database.repositories.progress.setStepCompleted(first?.id ?? '', true);

      // A fresh read through the same repository sees it.
      expect(
        database.repositories.progress.getProgress(created.pattern.id)
          .completedStepIds,
      ).toStrictEqual([first?.id]);

      // A second repositories instance over the same connection sees it too,
      // proving the write autocommitted rather than being cached in memory or
      // held in an open transaction (NFR-02).
      const reopened = createRepositories({
        connection: database.connection,
        now: database.now,
        newId: database.newId,
      });
      expect(
        reopened.progress.getProgress(created.pattern.id).completedStepIds,
      ).toStrictEqual([first?.id]);
    });

    it('advances then clears the active position as the hook drives completion', () => {
      const created = database.repositories.patterns.createPattern({
        title: 'Advance',
        steps: ['s0', 's1', 's2'],
      });
      const [s0, s1, s2] = created.steps;
      const { progress } = database.repositories;

      // The hook completes the current step then points active at the next
      // incomplete one.
      progress.setStepCompleted(s0?.id ?? '', true);
      progress.setActiveStep(created.pattern.id, s1?.id ?? null);
      expect(progress.getProgress(created.pattern.id).activeStepId).toBe(s1?.id);

      // Completing through the last step clears the pointer while completion
      // remains recorded ("Pattern complete").
      progress.setStepCompleted(s1?.id ?? '', true);
      progress.setStepCompleted(s2?.id ?? '', true);
      progress.setActiveStep(created.pattern.id, null);

      const after = progress.getProgress(created.pattern.id);
      expect(after.activeStepId).toBeUndefined();
      expect(after.completedStepIds).toStrictEqual([s0?.id, s1?.id, s2?.id]);
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

    it('resolves exactly one primary counter per owner, idempotently', () => {
      const pattern = database.repositories.patterns.createPattern({
        title: 'Pattern A',
        steps: [],
      });
      const owner = { kind: 'pattern' as const, id: pattern.pattern.id };

      const first =
        database.repositories.counters.getOrCreatePrimaryCounter(owner);
      // Defaults are pinned literals: a maker-labelled 'Rows'/'custom'/0 counter.
      expect(first.label).toBe('Rows');
      expect(first.kind).toBe('custom');
      expect(first.value).toBe(0);
      expect(first.position).toBe(0);

      // A second call returns the same row rather than creating a second one.
      const second =
        database.repositories.counters.getOrCreatePrimaryCounter(owner);
      expect(second.id).toBe(first.id);
      expect(
        database.connection.first<{ readonly total: number }>(
          'SELECT COUNT(*) AS total FROM counter WHERE pattern_id = ?',
          [pattern.pattern.id],
        )?.total,
      ).toBe(1);
    });

    it('keeps each project\u2019s primary counter distinct and never leaks a count', () => {
      const patternA = database.repositories.patterns.createPattern({
        title: 'Pattern A',
        steps: [],
      });
      const patternB = database.repositories.patterns.createPattern({
        title: 'Pattern B',
        steps: [],
      });

      const counterA = database.repositories.counters.getOrCreatePrimaryCounter({
        kind: 'pattern',
        id: patternA.pattern.id,
      });
      const counterB = database.repositories.counters.getOrCreatePrimaryCounter({
        kind: 'pattern',
        id: patternB.pattern.id,
      });
      expect(counterA.id).not.toBe(counterB.id);

      database.repositories.counters.adjustCounter(counterA.id, 5);

      // A's count is 5; B's stays 0 \u2014 a shared/global counter would leak.
      expect(
        database.repositories.counters.getOrCreatePrimaryCounter({
          kind: 'pattern',
          id: patternA.pattern.id,
        }).value,
      ).toBe(5);
      expect(
        database.repositories.counters.getOrCreatePrimaryCounter({
          kind: 'pattern',
          id: patternB.pattern.id,
        }).value,
      ).toBe(0);
    });

    it('renames the label while preserving the count and advancing updated_at', () => {
      const pattern = database.repositories.patterns.createPattern({
        title: 'Pattern A',
        steps: [],
      });
      const counter = database.repositories.counters.getOrCreatePrimaryCounter({
        kind: 'pattern',
        id: pattern.pattern.id,
      });
      const withValue = database.repositories.counters.adjustCounter(
        counter.id,
        4,
      );

      const renamed = database.repositories.counters.renameCounter(
        counter.id,
        'Stitches',
      );

      expect(renamed.label).toBe('Stitches');
      // The value is untouched by a rename \u2014 pinned to 4.
      expect(renamed.value).toBe(4);
      expect(renamed.updatedAt).toBeGreaterThan(withValue.updatedAt);
    });

    it('restores the same primary counter and value across a reopen without duplicating it', () => {
      const pattern = database.repositories.patterns.createPattern({
        title: 'Pattern A',
        steps: [],
      });
      const owner = { kind: 'pattern' as const, id: pattern.pattern.id };
      const created =
        database.repositories.counters.getOrCreatePrimaryCounter(owner);
      database.repositories.counters.adjustCounter(created.id, 7);

      // A second repositories instance over the same connection proxies a reopen.
      const reopened = createRepositories({
        connection: database.connection,
        now: database.now,
        newId: database.newId,
      });
      const restored = reopened.counters.getOrCreatePrimaryCounter(owner);

      expect(restored.id).toBe(created.id);
      expect(restored.value).toBe(7);
      expect(
        database.connection.first<{ readonly total: number }>(
          'SELECT COUNT(*) AS total FROM counter WHERE pattern_id = ?',
          [pattern.pattern.id],
        )?.total,
      ).toBe(1);
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

    /**
     * Issue #51 / architecture §9.3 — saving a guide as a pattern is a
     * **notes-only snapshot**: a composition over `getGuideWithSteps` and
     * `createPattern` with no foreign key, no new column, and no migration. These
     * cases pin the persistence half of that contract at the layer where a
     * cascade, a dedupe, or a wrong sort would actually happen; the screen and
     * router suites cover the hook that performs the same composition in the app.
     */
    describe('saved as a pattern (issue #51)', () => {
      const VIDEO_ID = 'dQw4w9WgXcQ';
      const CANONICAL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      function seedGuide(instructions: readonly string[]) {
        return database.repositories.guides.saveImportedGuide({
          guide: {
            videoId: VIDEO_ID,
            sourceUrl: `https://youtu.be/${VIDEO_ID}`,
            title: 'Amigurumi Basics',
            notes: 'Hook 4.0 mm',
          },
          steps: instructions.map((instruction) => ({
            instruction,
            origin: 'import' as const,
          })),
        });
      }

      /** The exact composition the review screen commits. */
      function convert(guideId: string) {
        const loaded = database.repositories.guides.getGuideWithSteps(guideId);
        if (loaded === undefined) {
          throw new Error('guide not found');
        }

        const draft = guidePatternSnapshot({
          videoId: loaded.guide.videoId,
          title: loaded.guide.title,
          notes: loaded.guide.notes,
          steps: loaded.steps,
        });

        return database.repositories.patterns.createPattern({
          title: draft.title,
          notes: draft.notes,
          steps: draft.steps,
        });
      }

      function rawStepCount(patternId: string): number {
        return (
          database.connection.first<{ readonly total: number }>(
            'SELECT COUNT(*) AS total FROM pattern_step WHERE pattern_id = ?',
            [patternId],
          )?.total ?? -1
        );
      }

      it('records the canonical watch URL and every step, in order', () => {
        const guide = seedGuide(['Magic ring', 'Chain 12', 'Fasten off']);
        const created = convert(guide.guide.id);

        expect(created.pattern.notes).toContain(`Saved from YouTube: ${CANONICAL}`);
        expect(created.pattern.notes).toContain('Hook 4.0 mm');
        expect(created.steps.map((step) => step.instruction)).toStrictEqual([
          'Magic ring',
          'Chain 12',
          'Fasten off',
        ]);
        expect(created.steps.map((step) => step.position)).toStrictEqual([0, 1, 2]);
      });

      it('survives deleting the guide, pattern steps included', () => {
        const guide = seedGuide(['Magic ring', 'Chain 12', 'Fasten off']);
        const created = convert(guide.guide.id);

        database.repositories.guides.deleteGuide(guide.guide.id);

        expect(
          database.repositories.guides.getGuideWithSteps(guide.guide.id),
        ).toBeUndefined();

        const reread = database.repositories.patterns.getPatternWithSteps(
          created.pattern.id,
        );
        expect(reread?.steps.map((step) => step.instruction)).toStrictEqual([
          'Magic ring',
          'Chain 12',
          'Fasten off',
        ]);
        // The raw count matters: a cascade that took the pattern AND its steps
        // would make the repository read return `undefined`, which is easy to
        // misread as "missing". Both layers are pinned so neither can hide it.
        expect(rawStepCount(created.pattern.id)).toBe(3);
      });

      it('is a snapshot: editing the guide afterwards changes nothing', () => {
        const guide = seedGuide(['Magic ring', 'Chain 12', 'Fasten off']);
        const created = convert(guide.guide.id);
        const before = database.repositories.patterns.getPatternWithSteps(
          created.pattern.id,
        );

        const { guides } = database.repositories;
        const stepIds = guide.steps.map((step) => step.id);
        guides.updateGuideStep(stepIds[0] as string, {
          instruction: 'Rewritten first step',
        });
        guides.reorderGuideSteps(guide.guide.id, [...stepIds].reverse());
        guides.updateGuideDetails({
          id: guide.guide.id,
          title: 'A completely different guide',
          notes: 'Different notes',
        });
        guides.deleteGuideStep(stepIds[1] as string);

        const after = database.repositories.patterns.getPatternWithSteps(
          created.pattern.id,
        );
        expect(after?.pattern.title).toBe(before?.pattern.title);
        expect(after?.pattern.notes).toBe(before?.pattern.notes);
        expect(after?.steps.map((step) => step.instruction)).toStrictEqual(
          before?.steps.map((step) => step.instruction),
        );
        expect(after?.steps.map((step) => step.position)).toStrictEqual(
          before?.steps.map((step) => step.position),
        );
      });

      it('creates two fully independent patterns from the identical input twice', () => {
        // The duplicate decision, pinned. This fails under any implementation
        // that dedupes on the title or the notes URL, or that updates an
        // existing pattern in place.
        const guide = seedGuide(['Magic ring', 'Chain 12', 'Fasten off']);
        const before = database.repositories.patterns.listPatterns().length;

        const first = convert(guide.guide.id);
        const second = convert(guide.guide.id);

        expect(first.pattern.id).not.toBe(second.pattern.id);
        expect(database.repositories.patterns.listPatterns()).toHaveLength(
          before + 2,
        );
        expect(first.steps).toHaveLength(3);
        expect(second.steps).toHaveLength(3);

        const firstStepIds = new Set(first.steps.map((step) => step.id));
        expect(
          second.steps.filter((step) => firstStepIds.has(step.id)),
        ).toStrictEqual([]);

        // And they stay independent: editing one leaves the other untouched.
        database.repositories.patterns.editStep(
          second.steps[0]?.id ?? '',
          'Only the fork changes',
        );
        expect(
          database.repositories.patterns
            .getPatternWithSteps(first.pattern.id)
            ?.steps.map((step) => step.instruction),
        ).toStrictEqual(['Magic ring', 'Chain 12', 'Fasten off']);
      });

      it('is the maker’s own pattern, never a bundled one', () => {
        const guide = seedGuide(['Magic ring']);
        const created = convert(guide.guide.id);

        expect(created.pattern.origin).toBe('user');
        expect(
          database.connection.first<{ readonly total: number }>(
            'SELECT COUNT(*) AS total FROM pattern_seed_state WHERE pattern_id = ?',
            [created.pattern.id],
          )?.total,
        ).toBe(0);
      });

      it('carries no completion over, whatever the guide’s progress', () => {
        const guide = seedGuide(['Magic ring', 'Chain 12', 'Fasten off']);
        const stepIds = guide.steps.map((step) => step.id);
        database.repositories.guides.setGuideStepCompleted(
          stepIds[0] as string,
          true,
        );
        database.repositories.guides.setGuideStepCompleted(
          stepIds[2] as string,
          true,
        );

        const created = convert(guide.guide.id);

        expect(created.steps).toHaveLength(3);
        expect(
          database.repositories.progress.getProgress(created.pattern.id)
            .completedStepIds,
        ).toStrictEqual([]);
        expect(
          database.connection.first<{ readonly total: number }>(
            'SELECT COUNT(*) AS total FROM pattern_step_progress WHERE pattern_id = ?',
            [created.pattern.id],
          )?.total,
        ).toBe(0);
      });

      it('follows a reordered guide, not insertion or alphabetical order', () => {
        const guide = seedGuide(['A', 'B', 'C']);
        const [a, b, c] = guide.steps.map((step) => step.id) as [
          string,
          string,
          string,
        ];
        database.repositories.guides.reorderGuideSteps(guide.guide.id, [c, a, b]);

        const created = convert(guide.guide.id);

        expect(created.steps.map((step) => step.instruction)).toStrictEqual([
          'C',
          'A',
          'B',
        ]);
        expect(created.steps.map((step) => step.position)).toStrictEqual([0, 1, 2]);
      });

      it('tops the library under the recency ordering (FR-PA-07)', () => {
        database.repositories.patterns.createPattern({
          title: 'An older pattern',
          steps: ['Chain 20'],
        });
        const guide = seedGuide(['Magic ring']);

        const created = convert(guide.guide.id);

        expect(database.repositories.patterns.listPatterns()[0]?.id).toBe(
          created.pattern.id,
        );
      });
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
