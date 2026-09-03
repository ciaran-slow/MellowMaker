import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Linking, Text, View } from 'react-native';

import { CraftCard } from '@/ui/components/CraftCard';
import { CraftPressable } from '@/ui/components/CraftPressable';
import tokens from '@/ui/theme/tokens.json';

type GuidePlayerPlaceholderProps = {
  sourceUrl: string;
  /** Card header; defaults to the offline "plays in the YouTube app" copy. */
  title?: string;
  /** Body copy; defaults to the offline reassurance line. */
  message?: string | undefined;
  /** When present, render a "Try again" control that calls it (recovery, #11). */
  onRetry?: () => void;
};

const DEFAULT_TITLE = 'Video plays in the YouTube app';
const DEFAULT_MESSAGE =
  'Your saved steps and progress below work without the video, even offline.';

/**
 * The video region's text fallback. In #10 this was the only video surface; #11
 * makes it the loading/offline/error fallback body of `GuideVideoPlayer`. It is a
 * 16:9 card carrying a header, a message, and an "Open in YouTube" link-out
 * (React Native `Linking`, no new dependency, offline-tolerant), and — when
 * `onRetry` is supplied — a "Try again" control. It sits **above** the steps,
 * inside the working view's `ListHeaderComponent` since #43, and never wraps,
 * gates, or disables them: the saved instructions below stay fully readable and
 * interactive in every state, offline included (FR-GU-06).
 */
export function GuidePlayerPlaceholder({
  sourceUrl,
  title = DEFAULT_TITLE,
  message = DEFAULT_MESSAGE,
  onRetry,
}: GuidePlayerPlaceholderProps) {
  return (
    <CraftCard accent="blue">
      <View
        accessibilityElementsHidden
        className="w-full items-center justify-center rounded-medium bg-background"
        importantForAccessibility="no-hide-descendants"
        style={{ aspectRatio: 16 / 9 }}
      >
        <MaterialCommunityIcons
          color={tokens.colors.blue}
          name="youtube"
          size={tokens.typography.display.fontSize}
        />
      </View>
      <Text accessibilityRole="header" className="text-heading text-ink">
        {title}
      </Text>
      <Text className="text-body text-ink">{message}</Text>
      {onRetry === undefined ? null : (
        <CraftPressable
          accessibilityHint="Reloads the video without changing your saved steps"
          accessibilityLabel="Try again to load the video"
          className="items-center self-start bg-yellow px-6 py-3"
          onPress={onRetry}
        >
          <Text className="text-label text-ink">Try again</Text>
        </CraftPressable>
      )}
      <CraftPressable
        accessibilityHint="Opens this guide's video in YouTube"
        accessibilityLabel="Open in YouTube"
        className="flex-row items-center gap-2 self-start bg-tealStrong px-6 py-3"
        onPress={() => {
          // Best-effort: offline or a missing YouTube app leaves the saved steps
          // below as the fallback. A rejected open is swallowed, not a crash.
          void Linking.openURL(sourceUrl).catch(() => {});
        }}
      >
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={tokens.colors.surface}
          name="open-in-new"
          size={tokens.typography.body.fontSize}
        />
        <Text className="text-label text-surface">Open in YouTube</Text>
      </CraftPressable>
    </CraftCard>
  );
}
