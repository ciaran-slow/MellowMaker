/**
 * Pure playback helpers for the compliant YouTube IFrame player (issue #11).
 * Imports nothing from React, Expo, `react-native-youtube-iframe`, or any other
 * layer (lint enforces the boundary), so the seek-unit conversion and the
 * error-reason→text mapping are trivially unit-testable at the narrowest level.
 */

export type GuidePlaybackStatus = 'loading' | 'ready' | 'error';

/**
 * Converts a stored millisecond step offset to the YouTube IFrame player's seek
 * unit (seconds). Stored offsets are integer-second multiples
 * (`parseStepTimestamp` × 1000), so this is exact. It is an **absolute**,
 * pure-of-argument conversion: the same `ms` always yields the same seconds,
 * never accumulated across calls — the same offset seeked twice lands on the
 * same second, never advances. Negative input clamps to 0 so a bad offset can
 * never seek before the video start.
 */
export function videoOffsetMsToSeconds(ms: number): number {
  return Math.max(0, ms) / 1000;
}

/**
 * Maps a `react-native-youtube-iframe` `onError` reason to display text
 * (FR-GU-06). The reason is one of
 * `'invalid_parameter' | 'HTML5_error' | 'video_not_found' | 'embed_not_allowed'`;
 * unknown/absent reasons (including a WebView load failure when offline) fall
 * through to the connectivity message, so offline is reported honestly without a
 * NetInfo dependency. Returned strings are display-only and never rendered as
 * markup.
 */
export function playbackErrorMessage(reason: string | undefined): string {
  switch (reason) {
    case 'video_not_found':
      return 'This video is unavailable — it may be private or removed. Your saved steps below still work.';
    case 'embed_not_allowed':
      return "This video's owner doesn't allow it to play here. Open it in YouTube; your saved steps below still work.";
    default:
      // 'invalid_parameter', 'HTML5_error', an offline WebView load failure, or
      // anything else: a connection may be required, but the steps work offline.
      return 'The video couldn’t load — a connection may be required. Your saved steps below work offline.';
  }
}
