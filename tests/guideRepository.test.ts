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
