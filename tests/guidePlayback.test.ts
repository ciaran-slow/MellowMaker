import {
  playbackErrorMessage,
  videoOffsetMsToSeconds,
} from '@/features/guides/presentation/guidePlayback';

describe('videoOffsetMsToSeconds', () => {
  // Literals are written independently of the implementation: a `/100`,
  // `/10000`, or `* 1000` bug diverges from these exact expected seconds.
  it('converts a stored millisecond offset to whole seconds', () => {
    expect(videoOffsetMsToSeconds(42000)).toBe(42);
    expect(videoOffsetMsToSeconds(65000)).toBe(65);
  });

  it('maps a zero offset to the video start', () => {
    expect(videoOffsetMsToSeconds(0)).toBe(0);
  });

  it('clamps a negative offset to the start rather than seeking before it', () => {
    expect(videoOffsetMsToSeconds(-5000)).toBe(0);
  });

  it('is absolute — the same offset always yields the same second, never accumulated', () => {
    // A read-modify-write "advance by" bug would diverge on the second call.
    expect(videoOffsetMsToSeconds(42000)).toBe(42);
    expect(videoOffsetMsToSeconds(42000)).toBe(42);
  });
});

describe('playbackErrorMessage', () => {
  it('reports an unavailable video for video_not_found', () => {
    expect(playbackErrorMessage('video_not_found')).toContain('unavailable');
  });

  it('reports an embedding-disabled video for embed_not_allowed', () => {
    expect(playbackErrorMessage('embed_not_allowed')).toContain(
      "doesn't allow",
    );
  });

  it('falls through to the connectivity message for HTML5_error', () => {
    expect(playbackErrorMessage('HTML5_error')).toContain(
      'connection may be required',
    );
  });

  it('falls through to the connectivity message for an unknown/offline reason', () => {
    expect(playbackErrorMessage(undefined)).toContain(
      'connection may be required',
    );
  });
});
