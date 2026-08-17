import { normalizeYoutubeUrl } from '@/domain/guides/youtubeUrl';

// Two distinct valid ids so an equivalence assertion can never pass by accident.
const VID_A = 'dQw4w9WgXcQ';
const VID_B = 'aB3_-Zx9Y1z';
const CANONICAL_A = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function expectVideoId(raw: string, videoId: string) {
  const result = normalizeYoutubeUrl(raw);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.videoId).toBe(videoId);
  }

  return result;
}

describe('normalizeYoutubeUrl', () => {
  describe('supported forms resolve to one canonical identity', () => {
    const supported: readonly string[] = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      // Legacy embed path form and the privacy-enhanced domain (carried forward
      // from the #8 review); both must be accepted, not treated as non-YouTube.
      'https://www.youtube.com/v/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'http://youtube.com/watch?v=dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube.com/watch?v=dQw4w9WgXcQ',
    ];

    it.each(supported)('normalizes %s to the bare id and canonical url', (raw) => {
      const result = normalizeYoutubeUrl(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.videoId).toBe(VID_A);
        expect(result.canonicalUrl).toBe(CANONICAL_A);
      }
    });

    it('collapses a second distinct video to its own single id', () => {
      expectVideoId(`https://youtu.be/${VID_B}`, VID_B);
      expectVideoId(`https://www.youtube.com/embed/${VID_B}`, VID_B);
    });
  });

  describe('params never affect identity', () => {
    it('drops playlist, timestamp, and tracking params from the id', () => {
      const withPlaylistAndTime = normalizeYoutubeUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxx&t=42',
      );
      const shortWithTracking = normalizeYoutubeUrl(
        'https://youtu.be/dQw4w9WgXcQ?si=abc&t=42',
      );
      const shorts = normalizeYoutubeUrl(
        'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      );

      expect(withPlaylistAndTime.ok && withPlaylistAndTime.videoId).toBe(VID_A);
      expect(shortWithTracking.ok && shortWithTracking.videoId).toBe(VID_A);
      expect(shorts.ok && shorts.videoId).toBe(VID_A);
    });

    it('parses t/start into startSeconds without letting it touch identity', () => {
      const result = normalizeYoutubeUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42',
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.startSeconds).toBe(42);
        expect(result.videoId).toBe(VID_A);
        expect(result.canonicalUrl).toBe(CANONICAL_A);
        expect(result.canonicalUrl).not.toContain('42');
      }

      const seconds = normalizeYoutubeUrl('https://youtu.be/dQw4w9WgXcQ?t=90s');
      expect(seconds.ok && seconds.startSeconds).toBe(90);

      const none = normalizeYoutubeUrl(CANONICAL_A);
      expect(none.ok && none.startSeconds).toBe(undefined);
    });
  });

  describe('rejections carry a specific, pinned reason', () => {
    const cases: readonly [string, string][] = [
      ['', 'empty'],
      ['   ', 'empty'],
      ['https://vimeo.com/12345', 'not-youtube'],
      ['https://example.com/watch?v=dQw4w9WgXcQ', 'not-youtube'],
      ['https://www.youtube.com/@handle', 'no-video-id'],
      ['https://www.youtube.com/playlist?list=PL123', 'no-video-id'],
      ['https://www.youtube.com/results?search_query=cat', 'no-video-id'],
      ['https://www.youtube.com/', 'no-video-id'],
    ];

    it.each(cases)('rejects %s as %s', (raw, reason) => {
      const result = normalizeYoutubeUrl(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe(reason);
      }
    });
  });

  describe('id shape boundary (pinned lengths, not derived from a constant)', () => {
    it('accepts an exactly-11-char id', () => {
      const result = normalizeYoutubeUrl('https://youtu.be/abc123DEF_-');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.videoId).toBe('abc123DEF_-');
      }
    });

    it('rejects a 10-char id as invalid-video-id', () => {
      const result = normalizeYoutubeUrl('https://youtu.be/abc123DEF_');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid-video-id');
      }
    });

    it('rejects a 12-char id as invalid-video-id (never truncates)', () => {
      const result = normalizeYoutubeUrl('https://youtu.be/abc123DEF_-1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid-video-id');
      }
    });

    it('rejects an 11-char candidate with a disallowed character', () => {
      const result = normalizeYoutubeUrl('https://youtu.be/abc12$DEF_-');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid-video-id');
      }
    });
  });
});
