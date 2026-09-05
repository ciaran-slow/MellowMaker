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
 * - an `undefined`/empty message announces nothing and **clears** the memory,
 *   so the same text reappearing later is a new event and is spoken again —
 *   an inline error a maker repeats after fixing it, or a refresh that ends the
 *   same way twice. Android's remounting alert speaks those again too; the
 *   list screens never clear mid-reload (their `reload` keeps `ready`), so a
 *   tab return with an unchanged count stays quiet.
 * - an **unchanged** message whose `attempt` advanced is announced again
 *   (issue #66). `attempt` is a maker-initiated validation counter, bumped by
 *   whoever owns the submit handler and never by an input change, a mount, or
 *   an effect. It defaults to `0` and never moves for a caller that omits it,
 *   so every unconverted call site behaves exactly as before. The two
 *   scenarios this clause stands between:
 *   - **serves** — the maker taps the same failing control twice. The rejection
 *     is already on screen, so nothing changes and, without the attempt,
 *     nothing is spoken: a dead tap.
 *   - **must not break** — a re-render the maker did not cause (the editor
 *     re-reading the guide after a step mutation, a keystroke in a neighbouring
 *     field) leaves both message and attempt untouched, and stays silent.
 *
 * It is presentation-only: no persistence waits on it and it holds no durable
 * state. It announces only text the maker can already see on screen.
 */
export function useAnnouncement(
  message: string | undefined,
  attempt = 0,
): void {
  const previous = useRef<string | undefined>(undefined);
  const previousAttempt = useRef(attempt);
  const settled = useRef(false);

  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      previous.current = message;
      previousAttempt.current = attempt;

      return;
    }

    const attemptChanged = attempt !== previousAttempt.current;
    previousAttempt.current = attempt;

    if (message === undefined || message === '') {
      previous.current = undefined;

      return;
    }

    if (message === previous.current && !attemptChanged) {
      return;
    }

    previous.current = message;

    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [attempt, message]);
}
