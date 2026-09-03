import { Text } from 'react-native';

import { useAnnouncement } from '@/ui/accessibility/useAnnouncement';

type CraftAnnouncementProps = {
  /** The visible text; it is also what the screen reader speaks. */
  message: string;
  /** Live-region politeness, Android's announcement path. Defaults to polite. */
  politeness?: 'polite' | 'assertive';
  /** Set `alert` for an inline error so the region is also exposed as one. */
  accessibilityRole?: 'alert' | 'text';
  /** Token classes for the visible line; every caller styles it explicitly. */
  className: string;
};

/**
 * The one primitive that speaks a visible status line on both platforms: it
 * renders the `accessibilityLiveRegion` Android announces from, and runs
 * `useAnnouncement` so VoiceOver speaks the same text on iOS. Screens render
 * this in place of a hand-rolled live-region `Text` so the two platform paths
 * can never drift apart (architecture §10: one shared primitive, never a second
 * copy of the same behaviour).
 */
export function CraftAnnouncement({
  accessibilityRole,
  className,
  message,
  politeness = 'polite',
}: CraftAnnouncementProps) {
  useAnnouncement(message);

  return (
    <Text
      accessibilityLiveRegion={politeness}
      className={className}
      {...(accessibilityRole === undefined ? {} : { accessibilityRole })}
    >
      {message}
    </Text>
  );
}
