import { Text } from 'react-native';

import { useAnnouncement } from '@/ui/accessibility/useAnnouncement';

type CraftAnnouncementProps = {
  /** The visible text; it is also what the screen reader speaks. */
  message: string;
  /** Live-region politeness, Android's announcement path. Defaults to polite. */
  politeness?: 'polite' | 'assertive';
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
 *
 * This is a **status line**, never an alert. It used to accept an
 * `accessibilityRole` of `'alert' | 'text'` and spread it onto the rendered
 * `Text`, so `<CraftAnnouncement accessibilityRole="alert"
 * politeness="assertive">` reproduced the inline-rejection shape at runtime —
 * without an `attempt`, so the repeat would be silent again, and through a
 * spread, so `tests/inlineErrorPrimitive.test.tsx` could not see it (PR #69
 * verify finding 3). No caller ever passed it, so the prop is gone: an inline
 * validation error goes through `CraftInlineError`, and nothing outside that
 * primitive may be both a live region and an alert.
 */
export function CraftAnnouncement({
  className,
  message,
  politeness = 'polite',
}: CraftAnnouncementProps) {
  useAnnouncement(message);

  return (
    <Text accessibilityLiveRegion={politeness} className={className}>
      {message}
    </Text>
  );
}
