import React from 'react';

/**
 * Shared Jest stub for `react-native-youtube-iframe`, so no suite loads the real
 * WebView-hosted IFrame. It renders nothing, captures the last props (so a test
 * can drive `onReady`/`onError`), and exposes an imperative `seekTo` spy through
 * the forwarded ref (so a test can assert the seek unit). `tests/setup.ts` wires
 * this in globally and resets it after every test; suites that need to drive or
 * assert playback import these handles directly.
 */

type CapturedProps = {
  onReady?: () => void;
  onError?: (reason: string) => void;
  videoId?: string;
  height?: number;
};

/** Imperative seek spy exposed through the player ref. */
export const mockSeekTo = jest.fn();

let lastProps: CapturedProps | undefined;
let liveCount = 0;
let mountCount = 0;

/** The most recent props the mocked `<YoutubePlayer>` was rendered with. */
export function getLastYoutubeProps(): CapturedProps | undefined {
  return lastProps;
}

/**
 * How many mocked `<YoutubePlayer>` (WebView) instances are currently mounted.
 * Lets a test assert the player was actually torn down on blur/unmount — e.g.
 * `0` after navigating away proves the WebView was released, not left running.
 */
export function youtubePlayerLiveCount(): number {
  return liveCount;
}

/**
 * How many mocked `<YoutubePlayer>` (WebView) instances have mounted in total
 * since the last reset — cumulative, so it never goes down. `youtubePlayerLiveCount()`
 * cannot see a remount: an unmount plus a remount nets back to 1. A rising mount
 * count with a live count of 1 is the signature of the working view's chrome
 * being remounted (e.g. an inline `ListHeaderComponent` creating a fresh
 * component type on every render), which tears the WebView down and reloads the
 * video mid-session.
 */
export function youtubePlayerMountCount(): number {
  return mountCount;
}

/**
 * Clears the seek spy, captured props, and the live-instance and cumulative
 * mount counts between tests.
 */
export function resetYoutubeIframeMock(): void {
  mockSeekTo.mockClear();
  lastProps = undefined;
  liveCount = 0;
  mountCount = 0;
}

const MockYoutubePlayer = React.forwardRef(function MockYoutubePlayer(
  props: CapturedProps,
  ref: React.Ref<{ seekTo: (seconds: number, allowSeekAhead: boolean) => void }>,
) {
  lastProps = props;
  React.useImperativeHandle(ref, () => ({ seekTo: mockSeekTo }));
  // Mirror a real WebView's lifecycle so a test can observe teardown: increment
  // while mounted, decrement on unmount.
  React.useEffect(() => {
    liveCount += 1;
    mountCount += 1;

    return () => {
      liveCount -= 1;
    };
  }, []);

  return null;
});

/** The module shape Jest substitutes for `react-native-youtube-iframe`. */
export const youtubeIframeMockModule = {
  __esModule: true,
  default: MockYoutubePlayer,
};
