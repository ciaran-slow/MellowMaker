import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Linking, Text, View } from 'react-native';

import { CraftCard } from '@/ui/components/CraftCard';
import { CraftPressable } from '@/ui/components/CraftPressable';
import tokens from '@/ui/theme/tokens.json';

type GuidePlayerPlaceholderProps = {
  sourceUrl: string;
};

/**
 * The video region of the guide working view. In #10 there is no player yet, so
 * this always renders: a 16:9 card carrying the video-unavailable / offline
 * message and an "Open in YouTube" link-out (React Native `Linking`, no new
 * dependency, offline-tolerant). It is a **sibling above** the step list and
 * never wraps, gates, or disables it — the saved instructions below stay fully
 * readable and interactive in every state (FR-GU-06).
 *
 * TODO(#11): mount the react-native-youtube-iframe WebView player here.
 * It must remain a sibling above the step list and must never gate or disable it;
 * when the video is unavailable or offline it degrades back to this placeholder.
 */
export function GuidePlayerPlaceholder({
  sourceUrl,
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
        Video plays in the YouTube app
      </Text>
      <Text className="text-body text-ink">
        Your saved steps and progress below work without the video, even offline.
      </Text>
      <CraftPressable
        accessibilityHint="Opens this guide's video in YouTube"
        accessibilityLabel="Open in YouTube"
        className="flex-row items-center gap-2 self-start bg-teal px-6 py-3"
        onPress={() => {
          // Best-effort: offline or a missing YouTube app leaves the saved steps
          // below as the fallback. A rejected open is swallowed, not a crash.
          void Linking.openURL(sourceUrl).catch(() => {});
        }}
      >
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={tokens.colors.ink}
          name="open-in-new"
          size={tokens.typography.body.fontSize}
        />
        <Text className="text-label text-ink">Open in YouTube</Text>
      </CraftPressable>
    </CraftCard>
  );
}
