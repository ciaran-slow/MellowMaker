import { createRepositories } from '@/data/sqlite/createRepositories';
import type { GuideRepository } from '@/data/contracts/guideRepository';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

function baseGuide(videoId: string, title: string) {
  return {
    guide: {
      videoId,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title,
    },
    steps: [],
  } as const;
}

describe('GuideRepository additions', () => {
  let database: TestDatabase;
  let guides: GuideRepository;

  beforeEach(() => {
    database = createTestDatabase();
    guides = database.repositories.guides;
  });

  afterEach(() => {
    database.close();
  });

  describe('guide-step authoring, ordering, and completion', () => {
    function newGuide(videoId = 'dQw4w9WgXcQ') {
      return guides.saveImportedGuide(baseGuide(videoId, 'Amigurumi Basics'))
        .guide.id;
    }

    it('appends a step at position = count with origin user', () => {
      const guideId = newGuide();

      const a = guides.addGuideStep(guideId, { instruction: 'A' });
      const b = guides.addGuideStep(guideId, { instruction: 'B' });

      expect([a.position, b.position]).toStrictEqual([0, 1]);
      expect(a.origin).toBe('user');
      expect(
        guides.getGuideWithSteps(guideId)?.steps.map((step) => step.instruction),
      ).toStrictEqual(['A', 'B']);
    });

    it('reorders steps to an exact new order and re-pins positions', () => {
      const guideId = newGuide();
      const a = guides.addGuideStep(guideId, { instruction: 'A' });
      const b = guides.addGuideStep(guideId, { instruction: 'B' });
      const c = guides.addGuideStep(guideId, { instruction: 'C' });

      guides.reorderGuideSteps(guideId, [c.id, a.id, b.id]);

      const steps = guides.getGuideWithSteps(guideId)?.steps ?? [];
      // Order is [C, A, B]; a no-op or naive impl leaves [A, B, C] or collides.
      expect(steps.map((step) => step.instruction)).toStrictEqual(['C', 'A', 'B']);
      // Positions are re-pinned contiguous: C=0, A=1, B=2.
      expect(steps.map((step) => step.position)).toStrictEqual([0, 1, 2]);
    });

    it('rejects a reorder that does not list the steps exactly once', () => {
      const guideId = newGuide();
      const a = guides.addGuideStep(guideId, { instruction: 'A' });
      const b = guides.addGuideStep(guideId, { instruction: 'B' });
      const c = guides.addGuideStep(guideId, { instruction: 'C' });

      // Missing C, and an unknown id, both throw; the order is left untouched.
      expect(() => guides.reorderGuideSteps(guideId, [a.id, b.id])).toThrow();
      expect(() =>
        guides.reorderGuideSteps(guideId, [a.id, b.id, 'ghost']),
      ).toThrow();

      expect(
        guides.getGuideWithSteps(guideId)?.steps.map((step) => step.id),
      ).toStrictEqual([a.id, b.id, c.id]);
    });

    it('re-compacts positions after a delete so an append cannot collide', () => {
      const guideId = newGuide();
      const a = guides.addGuideStep(guideId, { instruction: 'A' });
      const b = guides.addGuideStep(guideId, { instruction: 'B' });
      const c = guides.addGuideStep(guideId, { instruction: 'C' });

      guides.deleteGuideStep(b.id);

      const afterDelete = guides.getGuideWithSteps(guideId)?.steps ?? [];
      // Positions are pinned to 0,1 — NOT 0,2 — so the gap is closed.
      expect(
        afterDelete.map((step) => [step.instruction, step.position]),
      ).toStrictEqual([
        ['A', 0],
        ['C', 1],
      ]);
      expect([a.id, c.id]).toContain(afterDelete[0]?.id);

      // A subsequent append lands at position 2 with no UNIQUE collision.
      const d = guides.addGuideStep(guideId, { instruction: 'D' });
      expect(d.position).toBe(2);
    });

    it('treats deleting a stale step id as a no-op', () => {
      const guideId = newGuide();
      guides.addGuideStep(guideId, { instruction: 'A' });

      expect(() => guides.deleteGuideStep('ghost')).not.toThrow();
      expect(guides.getGuideWithSteps(guideId)?.steps).toHaveLength(1);
    });

    it('rewrites a step and clears optional fields it omits', () => {
      const guideId = newGuide();
      const step = guides.addGuideStep(guideId, {
        instruction: 'Old',
        videoOffsetMs: 42000,
        transcriptExcerpt: 'excerpt',
        note: 'note',
      });

      guides.updateGuideStep(step.id, { instruction: 'New' });

      const updated = guides.getGuideWithSteps(guideId)?.steps[0];
      expect(updated?.instruction).toBe('New');
      // The omitted optionals are cleared to NULL, not preserved.
      expect(updated?.videoOffsetMs).toBeUndefined();
      expect(updated?.transcriptExcerpt).toBeUndefined();
      expect(updated?.note).toBeUndefined();
      expect(updated?.userModifiedAt).toEqual(expect.any(Number));
    });

    it('writes and clears completion with a single absolute instant, durably', () => {
      const guideId = newGuide();
      const step = guides.addGuideStep(guideId, { instruction: 'A' });

      guides.setGuideStepCompleted(step.id, true);
      const completedAt = guides.getGuideWithSteps(guideId)?.steps[0]?.completedAt;
      expect(completedAt).toEqual(expect.any(Number));

      guides.setGuideStepCompleted(step.id, false);
      expect(
        guides.getGuideWithSteps(guideId)?.steps[0]?.completedAt,
      ).toBeUndefined();

      // Complete again, then reopen a fresh repository over the same DB: the
      // instant is read back from SQLite, proving durability (not in-memory).
      guides.setGuideStepCompleted(step.id, true);
      const durableAt = guides.getGuideWithSteps(guideId)?.steps[0]?.completedAt;
      const reopened = createRepositories({
        connection: database.connection,
        now: database.now,
        newId: database.newId,
      });
      expect(
        reopened.guides.getGuideWithSteps(guideId)?.steps[0]?.completedAt,
      ).toBe(durableAt);
    });

    it('is an absolute write, not a toggle: repeated same-value taps are idempotent', () => {
      const guideId = newGuide();
      const step = guides.addGuideStep(guideId, { instruction: 'A' });

      // Two identical "complete" taps must leave it completed — a
      // read-modify-write toggle would flip the second tap back to null.
      guides.setGuideStepCompleted(step.id, true);
      guides.setGuideStepCompleted(step.id, true);
      expect(
        guides.getGuideWithSteps(guideId)?.steps[0]?.completedAt,
      ).toEqual(expect.any(Number));

      // Two identical "reopen" taps must leave it incomplete — a toggle would
      // flip the second back to completed.
      guides.setGuideStepCompleted(step.id, false);
      guides.setGuideStepCompleted(step.id, false);
      expect(
        guides.getGuideWithSteps(guideId)?.steps[0]?.completedAt,
      ).toBeUndefined();
    });

    it('does not bump the guide updated_at when a step is completed', () => {
      const guideId = newGuide();
      const step = guides.addGuideStep(guideId, { instruction: 'A' });
      const before = guides.getGuideWithSteps(guideId)?.guide.updatedAt;

      guides.setGuideStepCompleted(step.id, true);

      // Completion is working state and must not churn library recency.
      expect(guides.getGuideWithSteps(guideId)?.guide.updatedAt).toBe(before);
    });

    it('persists order, timestamps, notes, transcript, and completion across a reopen', () => {
      const guideId = newGuide();
      const a = guides.addGuideStep(guideId, {
        instruction: 'A',
        videoOffsetMs: 42000,
      });
      const b = guides.addGuideStep(guideId, { instruction: 'B' });
      const c = guides.addGuideStep(guideId, {
        instruction: 'C',
        videoOffsetMs: 65000,
        transcriptExcerpt: 'chain six',
        note: 'use a stitch marker',
      });
      guides.reorderGuideSteps(guideId, [c.id, a.id, b.id]);
      guides.setGuideStepCompleted(c.id, true);

      const reopened = createRepositories({
        connection: database.connection,
        now: database.now,
        newId: database.newId,
      });
      const steps = reopened.guides.getGuideWithSteps(guideId)?.steps ?? [];

      expect(steps.map((step) => step.instruction)).toStrictEqual(['C', 'A', 'B']);
      expect(steps[0]?.videoOffsetMs).toBe(65000);
      expect(steps[0]?.transcriptExcerpt).toBe('chain six');
      expect(steps[0]?.note).toBe('use a stitch marker');
      expect(steps[0]?.completedAt).toEqual(expect.any(Number));
      expect(steps[1]?.videoOffsetMs).toBe(42000);
      expect(steps[1]?.completedAt).toBeUndefined();
    });
  });

  describe('appendImportedGuideSteps (issue #50)', () => {
    function newGuide(videoId = 'dQw4w9WgXcQ') {
      return guides.saveImportedGuide(baseGuide(videoId, 'Amigurumi Basics'))
        .guide.id;
    }

    const PARSED = [
      { instruction: 'Materials', videoOffsetMs: 0 },
      {
        instruction: 'Magic ring',
        videoOffsetMs: 72000,
        transcriptExcerpt: 'Magic ring',
      },
      { instruction: 'Round 1', videoOffsetMs: 160000 },
    ] as const;

    it('appends in order at position = count + index with origin import', () => {
      const guideId = newGuide();

      const returned = guides.appendImportedGuideSteps(guideId, PARSED);

      const steps = returned.steps;
      expect(steps.map((step) => step.instruction)).toStrictEqual([
        'Materials',
        'Magic ring',
        'Round 1',
      ]);
      expect(steps.map((step) => step.position)).toStrictEqual([0, 1, 2]);
      expect(steps.map((step) => step.origin)).toStrictEqual([
        'import',
        'import',
        'import',
      ]);
      expect(steps.map((step) => step.videoOffsetMs)).toStrictEqual([
        0, 72000, 160000,
      ]);
      expect(steps.map((step) => step.transcriptExcerpt)).toStrictEqual([
        undefined,
        'Magic ring',
        undefined,
      ]);
      // Imported steps arrive untouched and uncompleted.
      expect(steps.every((step) => step.completedAt === undefined)).toBe(true);
      expect(steps.every((step) => step.userModifiedAt === undefined)).toBe(true);
    });

    it('appends after maker-typed steps without disturbing any of them', () => {
      const guideId = newGuide();
      const a = guides.addGuideStep(guideId, {
        instruction: 'Typed A',
        videoOffsetMs: 1000,
      });
      const b = guides.addGuideStep(guideId, { instruction: 'Typed B' });
      guides.setGuideStepCompleted(a.id, true);
      guides.updateGuideStep(b.id, { instruction: 'Typed B edited' });

      const before = guides.getGuideWithSteps(guideId)?.steps ?? [];

      guides.appendImportedGuideSteps(guideId, PARSED);

      const after = guides.getGuideWithSteps(guideId)?.steps ?? [];
      expect(after.map((step) => step.position)).toStrictEqual([0, 1, 2, 3, 4]);
      // The two originals keep every field the maker owns.
      for (const original of before) {
        const kept = after.find((step) => step.id === original.id);
        expect(kept?.instruction).toBe(original.instruction);
        expect(kept?.origin).toBe('user');
        expect(kept?.userModifiedAt).toBe(original.userModifiedAt);
        expect(kept?.completedAt).toBe(original.completedAt);
      }
      expect(after.slice(0, 2).map((step) => step.instruction)).toStrictEqual([
        'Typed A',
        'Typed B edited',
      ]);
      expect(
        after.slice(2).map((step) => [step.position, step.origin]),
      ).toStrictEqual([
        [2, 'import'],
        [3, 'import'],
        [4, 'import'],
      ]);
    });

    it('appends a second copy when the same paste is applied twice', () => {
      const guideId = newGuide();

      guides.appendImportedGuideSteps(guideId, PARSED);
      guides.appendImportedGuideSteps(guideId, PARSED);

      const steps = guides.getGuideWithSteps(guideId)?.steps ?? [];
      // An append, not an absolute set: the repeat duplicates rather than
      // deduplicating (a repeated instruction is ordinary in a pattern) and the
      // positions stay contiguous, so nothing is corrupted.
      expect(steps.map((step) => step.instruction)).toStrictEqual([
        'Materials',
        'Magic ring',
        'Round 1',
        'Materials',
        'Magic ring',
        'Round 1',
      ]);
      expect(steps.map((step) => step.position)).toStrictEqual([
        0, 1, 2, 3, 4, 5,
      ]);
      expect(steps.every((step) => step.origin === 'import')).toBe(true);
    });

    it('writes nothing and does not touch the guide for an empty list', () => {
      const guideId = newGuide();
      guides.addGuideStep(guideId, { instruction: 'Typed A' });
      const before = guides.getGuideWithSteps(guideId)?.guide.updatedAt;

      const returned = guides.appendImportedGuideSteps(guideId, []);

      expect(returned.steps).toHaveLength(1);
      expect(returned.guide.updatedAt).toBe(before);
      expect(guides.getGuideWithSteps(guideId)?.guide.updatedAt).toBe(before);
    });

    it('touches the guide for a non-empty append', () => {
      const guideId = newGuide();
      const before = guides.getGuideWithSteps(guideId)?.guide.updatedAt;

      guides.appendImportedGuideSteps(guideId, PARSED);

      // Without this the empty-list case above would pass vacuously.
      expect(guides.getGuideWithSteps(guideId)?.guide.updatedAt).not.toBe(before);
    });

    it('keeps origin import when the maker later edits an imported step', () => {
      const guideId = newGuide();
      const appended = guides.appendImportedGuideSteps(guideId, [
        { instruction: 'Materials', videoOffsetMs: 0 },
      ]);
      const stepId = appended.steps[0]?.id ?? '';

      guides.updateGuideStep(stepId, { instruction: 'Materials, my way' });

      const edited = guides.getGuideWithSteps(guideId)?.steps[0];
      expect(edited?.instruction).toBe('Materials, my way');
      // Provenance survives the edit; the edit is stamped.
      expect(edited?.origin).toBe('import');
      expect(edited?.userModifiedAt).toEqual(expect.any(Number));
    });

    it('survives a reopen with order, offsets, excerpts, and origin intact', () => {
      const guideId = newGuide();
      guides.appendImportedGuideSteps(guideId, PARSED);

      const reopened = createRepositories({
        connection: database.connection,
        now: database.now,
        newId: database.newId,
      });

      const steps = reopened.guides.getGuideWithSteps(guideId)?.steps ?? [];
      expect(
        steps.map((step) => [
          step.instruction,
          step.videoOffsetMs,
          step.transcriptExcerpt,
          step.origin,
        ]),
      ).toStrictEqual([
        ['Materials', 0, undefined, 'import'],
        ['Magic ring', 72000, 'Magic ring', 'import'],
        ['Round 1', 160000, undefined, 'import'],
      ]);
    });

    it('rolls the whole batch back when one step violates a CHECK', () => {
      const guideId = newGuide();
      guides.addGuideStep(guideId, { instruction: 'Typed A' });

      expect(() =>
        guides.appendImportedGuideSteps(guideId, [
          { instruction: 'Good' },
          // The video_offset_ms CHECK forbids a negative offset.
          { instruction: 'Bad', videoOffsetMs: -1 },
        ]),
      ).toThrow();

      // No partial batch landed: the one maker-typed step is all that remains.
      const steps = guides.getGuideWithSteps(guideId)?.steps ?? [];
      expect(steps.map((step) => step.instruction)).toStrictEqual(['Typed A']);
    });
  });

  describe('updateGuideDetails', () => {
    it('rewrites the maker title and notes and can clear notes', () => {
      const saved = guides.saveImportedGuide({
        guide: {
          videoId: 'dQw4w9WgXcQ',
          sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Old title',
          notes: 'old notes',
        },
        steps: [],
      });

      const updated = guides.updateGuideDetails({
        id: saved.guide.id,
        title: 'New title',
      });

      // Unlike a refresh, a deliberate edit rewrites the title, and an omitted
      // notes value clears the stored notes to NULL.
      expect(updated.title).toBe('New title');
      expect(updated.notes).toBeUndefined();
    });

    it('throws when no guide carries the id', () => {
      expect(() =>
        guides.updateGuideDetails({ id: 'ghost', title: 'x' }),
      ).toThrow();
    });
  });

  describe('guide counter isolation and durability', () => {
    it('keeps each guide and pattern counter independent and persistent', () => {
      const { counters, patterns } = database.repositories;
      const g1 = guides.saveImportedGuide(baseGuide('aaaaaaaaaaa', 'G1')).guide.id;
      const g2 = guides.saveImportedGuide(baseGuide('bbbbbbbbbbb', 'G2')).guide.id;
      const p1 = patterns.createPattern({ title: 'P1', steps: [] }).pattern.id;

      const g1Counter = counters.getOrCreatePrimaryCounter({
        kind: 'guide',
        id: g1,
      });
      counters.getOrCreatePrimaryCounter({ kind: 'guide', id: g2 });
      counters.getOrCreatePrimaryCounter({ kind: 'pattern', id: p1 });

      counters.adjustCounter(g1Counter.id, 3);

      // Adjusting g1 leaves g2 and p1 at zero — a leak would show a nonzero value.
      expect(
        counters.getOrCreatePrimaryCounter({ kind: 'guide', id: g1 }).value,
      ).toBe(3);
      expect(
        counters.getOrCreatePrimaryCounter({ kind: 'guide', id: g2 }).value,
      ).toBe(0);
      expect(
        counters.getOrCreatePrimaryCounter({ kind: 'pattern', id: p1 }).value,
      ).toBe(0);

      // A second get for g1 returns the same row (idempotent), and a fresh
      // repository over the same DB reads the durable value of 3.
      expect(
        counters.getOrCreatePrimaryCounter({ kind: 'guide', id: g1 }).id,
      ).toBe(g1Counter.id);
      const reopened = createRepositories({
        connection: database.connection,
        now: database.now,
        newId: database.newId,
      });
      expect(
        reopened.counters.getOrCreatePrimaryCounter({ kind: 'guide', id: g1 })
          .value,
      ).toBe(3);
    });
  });

  describe('untrusted title round-trips without local corruption (issue #13, AC1)', () => {
    it('stores and reads a SQL-injection-style title byte-identical, table intact', () => {
      // A payload that would matter to a naive string-built query. Repositories
      // parameterize SQL (NFR-15), so it must round-trip as data, never execute.
      const injection = "Robert'); DROP TABLE imported_guide;--";
      const saved = guides.saveImportedGuide(
        baseGuide('dQw4w9WgXcQ', injection),
      );

      // Byte-identical read back through both accessors.
      expect(guides.getGuideWithSteps(saved.guide.id)?.guide.title).toBe(
        injection,
      );
      expect(guides.findGuideByVideoId('dQw4w9WgXcQ')?.guide.title).toBe(
        injection,
      );

      // The table survives: a second, distinct guide still saves and lists,
      // proving `DROP TABLE` was inert data, not executed DDL.
      const second = guides.saveImportedGuide(
        baseGuide('bbbbbbbbbbb', '<script>alert(1)</script>'),
      );
      const listed = guides.listGuides();
      expect(listed.map((guide) => guide.id)).toStrictEqual([
        second.guide.id,
        saved.guide.id,
      ]);
      // The markup title also round-trips verbatim (no strip/escape at the DB).
      expect(guides.getGuideWithSteps(second.guide.id)?.guide.title).toBe(
        '<script>alert(1)</script>',
      );
    });
  });

  describe('dedup on canonical video id', () => {
    it('finds an existing guide and refuses a second create for the same video', () => {
      const saved = guides.saveImportedGuide(baseGuide('dQw4w9WgXcQ', 'First'));

      expect(guides.findGuideByVideoId('dQw4w9WgXcQ')?.guide.id).toBe(
        saved.guide.id,
      );

      // The DB `video_id UNIQUE` constraint backstops the orchestration's dedup:
      // a second create for the same identity throws rather than duplicating.
      expect(() =>
        guides.saveImportedGuide(baseGuide('dQw4w9WgXcQ', 'Second')),
      ).toThrow();
    });
  });

  describe('refreshGuideMetadata', () => {
    it('updates provider fields while preserving the maker title and every step', () => {
      const saved = guides.saveImportedGuide({
        guide: {
          videoId: 'dQw4w9WgXcQ',
          sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Maker Title',
          creator: 'Old',
          thumbnailUrl: 'old.jpg',
        },
        steps: [
          { instruction: 'Row 1', origin: 'user' },
          { instruction: 'Row 2', origin: 'user' },
        ],
      });
      const stepIdsBefore = saved.steps.map((step) => step.id);

      const refreshed = guides.refreshGuideMetadata(saved.guide.id, {
        creator: 'New',
        thumbnailUrl: 'new.jpg',
        syncedAt: 999,
      });

      // Title is the maker's confirmed name and must never be overwritten.
      expect(refreshed.guide.title).toBe('Maker Title');
      expect(refreshed.guide.creator).toBe('New');
      expect(refreshed.guide.thumbnailUrl).toBe('new.jpg');
      expect(refreshed.guide.metadataSyncedAt).toBe(999);

      // Steps must be neither duplicated nor erased: same rows, same order.
      expect(refreshed.steps.map((step) => step.id)).toStrictEqual(stepIdsBefore);
      expect(refreshed.steps.map((step) => step.instruction)).toStrictEqual([
        'Row 1',
        'Row 2',
      ]);
    });

    it('preserves a stored field a refresh omits (COALESCE, no erasure)', () => {
      const saved = guides.saveImportedGuide({
        guide: {
          videoId: 'dQw4w9WgXcQ',
          sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Maker Title',
          creator: 'Old',
          thumbnailUrl: 'old.jpg',
        },
        steps: [],
      });

      const refreshed = guides.refreshGuideMetadata(saved.guide.id, {
        creator: 'New',
        syncedAt: 1000,
      });

      expect(refreshed.guide.creator).toBe('New');
      // No thumbnail in the refresh input keeps the stored value, not NULL.
      expect(refreshed.guide.thumbnailUrl).toBe('old.jpg');
    });
  });

  describe('listGuides', () => {
    it('orders most-recently-updated first and honours page bounds', () => {
      // The deterministic clock advances one second per write, so update order is
      // pinned by the clock rather than by insertion-index coincidence.
      const g1 = guides.saveImportedGuide(baseGuide('aaaaaaaaaaa', 'One'));
      const g2 = guides.saveImportedGuide(baseGuide('bbbbbbbbbbb', 'Two'));
      const g3 = guides.saveImportedGuide(baseGuide('ccccccccccc', 'Three'));

      expect(guides.listGuides().map((guide) => guide.id)).toStrictEqual([
        g3.guide.id,
        g2.guide.id,
        g1.guide.id,
      ]);

      const firstPage = guides.listGuides({ limit: 2, offset: 0 });
      expect(firstPage.map((guide) => guide.id)).toStrictEqual([
        g3.guide.id,
        g2.guide.id,
      ]);
    });

    it('projects the summary fields a list row needs', () => {
      const saved = guides.saveImportedGuide({
        guide: {
          videoId: 'dQw4w9WgXcQ',
          sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Amigurumi Basics',
          creator: 'Yarn Co',
          thumbnailUrl: 'thumb.jpg',
        },
        steps: [],
      });

      const [summary] = guides.listGuides();
      expect(summary).toStrictEqual({
        id: saved.guide.id,
        videoId: 'dQw4w9WgXcQ',
        title: 'Amigurumi Basics',
        creator: 'Yarn Co',
        thumbnailUrl: 'thumb.jpg',
        updatedAt: saved.guide.updatedAt,
      });
    });
  });
});
