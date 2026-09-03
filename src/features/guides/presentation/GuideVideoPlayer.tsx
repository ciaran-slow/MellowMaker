import { Text, useWindowDimensions, View } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';

import { GuidePlayerPlaceholder } from '@/features/guides/presentation/GuidePlayerPlaceholder';
import type { GuidePlayer } from '@/features/guides/presentation/useGuidePlayer';
import { useAnnouncement } from '@/ui/accessibility/useAnnouncement';
import { CraftCard } from '@/ui/components/CraftCard';

const PLAYBACK_FAILED_TITLE = 'Video can’t play right now';

type GuideVideoPlayerProps = {
  player: GuidePlayer;
  videoId: string;
  sourceUrl: string;
};

// The card's inner content sits inside `CraftCard`'s p-6 (24px) padding on each
// side; approximate the horizontal chrome so the WebView keeps a 16:9 shape on a
// phone. Clamped to the max content column so it never overshoots on a tablet.
const CARD_HORIZONTAL_PADDING = 48;
const MAX_CONTENT_WIDTH = 640;

/**
 * The compliant video surface of the guide working view (issue #11): YouTube's
 * official IFrame player rendered in a WebView (`react-native-youtube-iframe`
 * over `react-native-webview`), keyed to the guide's canonical `videoId`. It
 * plays only the sanctioned embed — no media-URL scraping (AC #5).
 *
 * States are text-first (FR-GU-06): while `loading` a polite live region says the
 * video is loading; `ready` shows the player; `error` tears the WebView down and
 * falls back to `GuidePlayerPlaceholder` — wrapped in an assertive `alert` region
 * matching the screen's other failure states — with a reason message, a "Try
 * again", and an "Open in YouTube" link-out. When the view is blurred (`!active`)
 * the WebView is unmounted so no player runs off-screen (NFR-10). In every state
 * it is a self-contained card riding in the working view's
 * `ListHeaderComponent` **above** the steps (issue #43) — it never wraps,
 * gates, or disables the saved instructions, completion, counter, or progress
 * (the #10 guarantee, preserved).
 */
export function GuideVideoPlayer({
  player,
  videoId,
  sourceUrl,
}: GuideVideoPlayerProps) {
  const {
    active,
    attempt,
    errorMessage,
    onError,
    onReady,
    registerPlayer,
    retry,
    status,
  } = player;
  const { width } = useWindowDimensions();

  // A playback failure is spoken on iOS through the announcement seam
  // (A11Y-07); the assertive alert region below remains Android's path.
  useAnnouncement(
    status === 'error'
      ? [PLAYBACK_FAILED_TITLE, errorMessage].filter(Boolean).join(' ')
      : undefined,
  );

  // Blurred: unmount the WebView entirely (real native release on navigate-away).
  // The view is off-screen here, so nothing visible is lost; refocus re-mounts it.
  if (!active) {
    return null;
  }

  if (status === 'error') {
    return (
      <View accessible accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <GuidePlayerPlaceholder
          message={errorMessage}
          onRetry={retry}
          sourceUrl={sourceUrl}
          title={PLAYBACK_FAILED_TITLE}
        />
      </View>
    );
  }

  const playerWidth = Math.min(width, MAX_CONTENT_WIDTH) - CARD_HORIZONTAL_PADDING;
  const playerHeight = Math.round((playerWidth * 9) / 16);

  return (
    <CraftCard accent="blue">
      {status === 'loading' ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="text"
          className="text-body text-ink"
        >
          Loading video…
        </Text>
      ) : null}
      <View className="w-full overflow-hidden rounded-medium bg-background">
        <YoutubePlayer
          key={attempt}
          height={playerHeight}
          onError={onError}
          onReady={onReady}
          play={false}
          ref={registerPlayer}
          videoId={videoId}
          webViewProps={{ allowsInlineMediaPlayback: true }}
        />
      </View>
    </CraftCard>
  );
}
