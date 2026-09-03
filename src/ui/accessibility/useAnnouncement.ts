import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * The iOS half of a screen-reader announcement. Every announcement in the app
 * is rendered as an `accessibilityLiveRegion`, which React Native honours on
 * Android only; VoiceOver never reads a live region, so without this seam a
 * counter change, step completion, error, or loading completion is spoken on
 * Android and silent on iOS (A11Y-07).
 *
 * The contract, each clause pinned by `tests/useAnnouncement.test.ts`:
 * - announces through `AccessibilityInfo.announceForAccessibility` on iOS only
 *   — Android already speaks the live region, and announcing both would
 *   double-speak under TalkBack;
 * - never announces on first render, so a screen does not talk over its own
 *   initial focus announcement (the settled-ref pattern `CraftCounter` uses);
 * - announces only when the message changes from the immediately previous
 *   one, so a re-render with the same text is silent but returning to an
 *   earlier value is spoken again;
 * - an `undefined`/empty message announces nothing and leaves the remembered
 *   previous message untouched.
 *
 * It is presentation-only: no persistence waits on it and it holds no durable
 * state. It announces only text the maker can already see on screen.
 */
export function useAnnouncement(message: string | undefined): void {
  const previous = useRef<string | undefined>(undefined);
  const settled = useRef(false);

  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      previous.current = message;

      return;
    }

    if (message === undefined || message === '') {
      return;
    }

    if (message === previous.current) {
      return;
    }

    previous.current = message;

    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);
}
