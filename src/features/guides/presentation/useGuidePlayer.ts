import { useCallback, useEffect, useRef, useState } from 'react';
import type { YoutubeIframeRef } from 'react-native-youtube-iframe';

import {
  playbackErrorMessage,
  videoOffsetMsToSeconds,
  type GuidePlaybackStatus,
} from '@/features/guides/presentation/guidePlayback';

export interface GuidePlayer {
  /** `loading` | `ready` | `error` — the text status machine (FR-GU-06). */
  readonly status: GuidePlaybackStatus;
  /** Display text for the current error; defined only when `status === 'error'`. */
  readonly errorMessage: string | undefined;
  /** Remount key for the `<YoutubePlayer>`; bumped by `retry()` for a fresh load. */
  readonly attempt: number;
  /**
   * Callback ref for the `<YoutubePlayer ref>`. React calls it with the player's
   * imperative handle on mount and with `null` on unmount, so the seek target is
   * always released on teardown (NFR-10) without exposing a raw ref object.
   */
  registerPlayer(instance: YoutubeIframeRef | null): void;
  /** The player finished loading → `ready`. */
  onReady(): void;
  /** The player reported an error → `error`, with `errorMessage` mapped from the reason. */
  onError(reason: string): void;
  /** Seek the loaded video to a stored ms offset — a guarded no-op unless `ready`. */
  seekToMs(ms: number): void;
  /** Return to `loading` and remount the player; touches no repository. */
  retry(): void;
}

/**
 * Owns the compliant YouTube IFrame player's imperative ref, its text status
 * machine, and the mounted-flag lifecycle guard (NFR-10). All WebView-touching
 * logic lives here so the working view and its tests drive playback through a
 * plain interface with `react-native-youtube-iframe` mocked.
 *
 * - `seekToMs` is guarded: it seeks only when the component is still mounted, the
 *   status is `ready`, and the player ref is attached. Seeking before ready,
 *   after an error, or after unmount is a safe no-op, so the saved instructions,
 *   completion, counter, and progress are never gated by playback (FR-GU-06).
 * - The seek is **absolute**: `videoOffsetMsToSeconds(ms)` is a pure function of
 *   its argument, so the same step badge always seeks to the same second and a
 *   repeated tap never advances (no read-modify-write).
 * - On unmount the mounted flag is cleared and the player ref nulled, so a late
 *   `onReady`/`onError`/`seekToMs` callback is suppressed — no state update on an
 *   unmounted component and no stale seek (NFR-10).
 * - A new `videoId` resets the machine to `loading` via the documented
 *   "adjust state during render" pattern, so switching guides in place never
 *   shows the previous video's ready/error state.
 * - `retry()` returns the machine to `loading` and bumps the remount key only; it
 *   reads and writes **no** repository, so recovery can never duplicate or mutate
 *   local guide data (AC #3).
 */
export function useGuidePlayer(videoId: string): GuidePlayer {
  const [status, setStatus] = useState<GuidePlaybackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const [attempt, setAttempt] = useState(0);
  const [trackedVideoId, setTrackedVideoId] = useState(videoId);

  // Cleared on unmount so no callback runs after teardown (NFR-10).
  const mounted = useRef(true);
  const playerRef = useRef<YoutubeIframeRef | null>(null);

  const registerPlayer = useCallback((instance: YoutubeIframeRef | null) => {
    playerRef.current = instance;
  }, []);

  // Reset to loading on a genuine videoId change — adjusting state during render
  // (React's documented pattern for deriving state from a changed prop). Guarded
  // by the tracked id so it runs once per change, never on every render.
  if (trackedVideoId !== videoId) {
    setTrackedVideoId(videoId);
    setStatus('loading');
    setErrorMessage(undefined);
  }

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      playerRef.current = null;
    };
  }, []);

  const onReady = useCallback(() => {
    if (!mounted.current) {
      return;
    }
    setStatus('ready');
    setErrorMessage(undefined);
  }, []);

  const onError = useCallback((reason: string) => {
    if (!mounted.current) {
      return;
    }
    setStatus('error');
    setErrorMessage(playbackErrorMessage(reason));
  }, []);

  const seekToMs = useCallback(
    (ms: number) => {
      if (!mounted.current || status !== 'ready' || playerRef.current === null) {
        return;
      }
      playerRef.current.seekTo(videoOffsetMsToSeconds(ms), true);
    },
    [status],
  );

  const retry = useCallback(() => {
    if (!mounted.current) {
      return;
    }
    setStatus('loading');
    setErrorMessage(undefined);
    setAttempt((previous) => previous + 1);
  }, []);

  return {
    status,
    errorMessage,
    attempt,
    registerPlayer,
    onReady,
    onError,
    seekToMs,
    retry,
  };
}
