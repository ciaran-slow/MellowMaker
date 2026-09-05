import {
  guidePatternSnapshot,
  type GuideSnapshotSource,
} from '@/domain/guides/guidePatternSnapshot';
import { canonicalWatchUrl, normalizeYoutubeUrl } from '@/domain/guides/youtubeUrl';

/**
 * Issue #51 / architecture §9.3: the guide→pattern snapshot is lossy by
 * construction, and this module is the single place the loss happens. Every case
 * below names a source bug that makes it fail — a timestamp prefixed onto an
 * instruction, a re-sort, a second URL copy, a dropped maker note.
 */

const VIDEO_ID = 'dQw4w9WgXcQ';
const CANONICAL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SOURCE_LINE = `Saved from YouTube: ${CANONICAL}`;

function source(
  overrides: Partial<GuideSnapshotSource> = {},
): GuideSnapshotSource {
  return {
    videoId: VIDEO_ID,
    title: 'Amigurumi Basics',
    notes: undefined,
    steps: [
      { instruction: 'Magic ring' },
      { instruction: 'Chain 12' },
      { instruction: 'Fasten off' },
    ],
    ...overrides,
  };
}

describe('guidePatternSnapshot', () => {
  it('drops everything a pattern step cannot hold', () => {
    // A guide step carries far more than `pattern_step` has columns for. The
    // extra fields are passed structurally so an implementation that formatted a
    // timestamp onto the instruction, or appended the excerpt, would be caught.
    const rich = {
      videoId: VIDEO_ID,
      title: 'Amigurumi Basics',
      notes: undefined,
      steps: [
        {
          instruction: 'Magic ring',
          videoOffsetMs: 42_000,
          transcriptExcerpt: 'now wrap the yarn around two fingers',
          note: 'go slowly here',
          origin: 'import' as const,
          completedAt: 1_700_000_000_000,
        },
        { instruction: 'Chain 12', videoOffsetMs: 90_000, origin: 'user' as const },
        { instruction: 'Fasten off', origin: 'import' as const },
      ],
    };

    const draft = guidePatternSnapshot(rich);

    expect(draft.steps).toStrictEqual(['Magic ring', 'Chain 12', 'Fasten off']);

    const serialized = JSON.stringify(draft);
    expect(serialized).not.toContain('0:42');
    expect(serialized).not.toContain('42000');
    expect(serialized).not.toContain('now wrap the yarn');
    expect(serialized).not.toContain('go slowly here');
    expect(serialized).not.toContain('import');
    expect(serialized).not.toContain('1700000000000');
  });

  it('preserves the given order and never re-sorts', () => {
    // Neither insertion order nor alphabetical: a sort of any kind reorders it.
    const draft = guidePatternSnapshot(
      source({
        steps: [
          { instruction: 'C' },
          { instruction: 'A' },
          { instruction: 'B' },
        ],
      }),
    );

    expect(draft.steps).toStrictEqual(['C', 'A', 'B']);
  });

  it('records the canonical watch URL once, derived from the video id', () => {
    // The input type carries no `sourceUrl` at all, so the URL can only have
    // come from `videoId` — the canonical identity — not from a stored string
    // with no canonical-form constraint.
    const draft = guidePatternSnapshot(source());

    expect(draft.notes.startsWith(SOURCE_LINE)).toBe(true);
    expect(draft.notes.match(/youtube\.com\/watch/g)).toHaveLength(1);
  });

  it('keeps the guide’s own notes after a blank line', () => {
    const draft = guidePatternSnapshot(
      source({ notes: 'Hook 4.0 mm\nWorsted cotton' }),
    );

    expect(draft.notes).toBe(`${SOURCE_LINE}\n\nHook 4.0 mm\nWorsted cotton`);
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['whitespace-only', '   \n  '],
  ])('collapses %s guide notes to the source line alone', (_label, notes) => {
    const draft = guidePatternSnapshot(source({ notes }));

    expect(draft.notes).toBe(SOURCE_LINE);
    expect(draft.notes.endsWith('\n')).toBe(false);
  });

  it('carries the title verbatim, trimming nothing', () => {
    const draft = guidePatternSnapshot(
      source({ title: "Nana's “granny” square — part 2 " }),
    );

    // Trimming is the review screen's `validatePatternTitle` job, not this
    // function's; punctuation must survive untouched either way.
    expect(draft.title).toBe("Nana's “granny” square — part 2 ");
  });

  it('handles a guide with no steps and still records the source', () => {
    const draft = guidePatternSnapshot(source({ steps: [] }));

    expect(draft.steps).toStrictEqual([]);
    expect(draft.notes).toBe(SOURCE_LINE);
  });
});

describe('canonicalWatchUrl agrees with normalizeYoutubeUrl', () => {
  // Extracting the helper must not fork the URL grammar: every supported form
  // still collapses to the same string the snapshot records.
  const supported: readonly string[] = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
    'https://www.youtube.com/v/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxx&t=42',
  ];

  it.each(supported)('%s canonicalizes to the same URL', (raw) => {
    const result = normalizeYoutubeUrl(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canonicalUrl).toBe(canonicalWatchUrl(result.videoId));
      expect(result.canonicalUrl).toBe(CANONICAL);
    }
  });

  it('builds the canonical form for a second distinct id', () => {
    expect(canonicalWatchUrl('aB3_-Zx9Y1z')).toBe(
      'https://www.youtube.com/watch?v=aB3_-Zx9Y1z',
    );
  });
});
