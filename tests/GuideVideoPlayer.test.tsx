import { act, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';

import { GuideVideoPlayer } from '@/features/guides/presentation/GuideVideoPlayer';
import {
  useGuidePlayer,
  type GuidePlayer,
} from '@/features/guides/presentation/useGuidePlayer';

import {
  getLastYoutubeProps,
  mockSeekTo,
} from './support/youtubeIframeMock';

// The shared `react-native-youtube-iframe` stub (wired in tests/setup.ts) renders
// nothing, captures the last props so a test can drive onReady/onError, and
// exposes the `seekTo` spy through the forwarded ref.

// A thin harness that owns one useGuidePlayer instance and renders the real
// GuideVideoPlayer, exposing the player so tests can drive seek/retry directly.
let currentPlayer: GuidePlayer | undefined;

function Harness({ videoId = 'dQw4w9WgXcQ' }: { videoId?: string }) {
  const player = useGuidePlayer(videoId);
  // Expose the live player to the test in an effect (a render side effect would
  // be impure); act() flushes it before the test reads it.
  useEffect(() => {
    currentPlayer = player;
  });

  return (
    <GuideVideoPlayer
      player={player}
      sourceUrl={`https://www.youtube.com/watch?v=${videoId}`}
      videoId={videoId}
    />
  );
}

function player(): GuidePlayer {
  if (currentPlayer === undefined) {
    throw new Error('Harness has not rendered a player yet');
  }
  return currentPlayer;
}

async function fireReady(): Promise<void> {
  await act(async () => {
    getLastYoutubeProps()?.onReady?.();
  });
}

async function fireError(reason: string): Promise<void> {
  await act(async () => {
    getLastYoutubeProps()?.onError?.(reason);
  });
}

beforeEach(() => {
  currentPlayer = undefined;
});

describe('GuideVideoPlayer seek', () => {
  it('seeks to the converted second offset once the player is ready', async () => {
    await render(<Harness />);

    await fireReady();
    await act(async () => {
      player().seekToMs(42000);
    });

    expect(mockSeekTo).toHaveBeenCalledWith(42, true);
  });

  it('does not seek before ready, nor after an error (guard)', async () => {
    await render(<Harness />);

    // status 'loading' — no onReady fired yet.
    await act(async () => {
      player().seekToMs(42000);
    });
    expect(mockSeekTo).not.toHaveBeenCalled();

    // status 'error' — seeking is still a no-op.
    await fireError('video_not_found');
    await act(async () => {
      player().seekToMs(42000);
    });
    expect(mockSeekTo).not.toHaveBeenCalled();
  });

  it('is idempotent — the same offset seeked twice lands on the same second both times', async () => {
    await render(<Harness />);

    await fireReady();
    await act(async () => {
      player().seekToMs(42000);
      player().seekToMs(42000);
    });

    // A read-modify-write "advance-by" bug would diverge on the second call.
    expect(mockSeekTo).toHaveBeenCalledTimes(2);
    expect(mockSeekTo).toHaveBeenNthCalledWith(1, 42, true);
    expect(mockSeekTo).toHaveBeenNthCalledWith(2, 42, true);
  });
});

describe('GuideVideoPlayer error states', () => {
  it('shows the embedding-disabled message with Try again and Open in YouTube', async () => {
    await render(<Harness />);

    await fireError('embed_not_allowed');

    expect(screen.getByText(/doesn't allow/)).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Try again to load the video' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Open in YouTube' }),
    ).toBeOnTheScreen();
  });

  it('shows the unavailable message for video_not_found', async () => {
    await render(<Harness />);

    await fireError('video_not_found');

    expect(screen.getByText(/unavailable/)).toBeOnTheScreen();
  });

  it('recovers to loading when Try again is pressed, and can seek after re-ready', async () => {
    await render(<Harness />);

    await fireError('HTML5_error');
    await act(async () => {
      player().retry();
    });

    // Back to a non-error state: the player re-mounts and can be readied again.
    await fireReady();
    await act(async () => {
      player().seekToMs(65000);
    });
    expect(mockSeekTo).toHaveBeenCalledWith(65, true);
  });
});

describe('GuideVideoPlayer unmount lifecycle (NFR-10)', () => {
  it('releases the seek target on unmount so a stale seek is a no-op, even from ready', async () => {
    const view = await render(<Harness />);

    // Reach `ready` first, so the post-unmount seek is gated only by the
    // teardown release (mounted-flag + nulled ref) — not by the status guard.
    await fireReady();

    // Capture the live player handle and a callback before teardown.
    const captured = player();
    const onError = getLastYoutubeProps()?.onError;

    await act(async () => {
      view.unmount();
    });

    // A seek after unmount is a no-op: the player ref is released on teardown, so
    // nothing is seeked (and nothing throws by dereferencing a torn-down player).
    expect(() => captured.seekToMs(42000)).not.toThrow();
    expect(mockSeekTo).not.toHaveBeenCalled();

    // A stale player callback after unmount is also a safe no-op.
    expect(() => onError?.('HTML5_error')).not.toThrow();
  });
});
