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

/** The most recent props the mocked `<YoutubePlayer>` was rendered with. */
export function getLastYoutubeProps(): CapturedProps | undefined {
  return lastProps;
}

/** Clears the seek spy and captured props between tests. */
export function resetYoutubeIframeMock(): void {
  mockSeekTo.mockClear();
  lastProps = undefined;
}

const MockYoutubePlayer = React.forwardRef(function MockYoutubePlayer(
  props: CapturedProps,
  ref: React.Ref<{ seekTo: (seconds: number, allowSeekAhead: boolean) => void }>,
) {
  lastProps = props;
  React.useImperativeHandle(ref, () => ({ seekTo: mockSeekTo }));

  return null;
});

/** The module shape Jest substitutes for `react-native-youtube-iframe`. */
export const youtubeIframeMockModule = {
  __esModule: true,
  default: MockYoutubePlayer,
};
