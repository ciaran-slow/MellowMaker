import { useId } from 'react';
import { Text } from 'react-native';

import { useAnnouncement } from '@/ui/accessibility/useAnnouncement';

type CraftInlineErrorProps = {
  /** The rejection copy; `undefined` when the field is currently valid. */
  message: string | undefined;
  /** Bumped once per maker-initiated validation, whatever the outcome. */
  attempt: number;
};

/**
 * The one primitive for an inline validation error line (issue #66). It owns
 * the assertive `alert` region every inline rejection used to hand-roll, and
 * runs `useAnnouncement` so VoiceOver speaks the same text on iOS.
 * `tests/inlineErrorPrimitive.test.tsx` bans a second copy of the shape.
 *
 * Three things about the rendered element are load-bearing:
 *
 * 1. **`key` is Android's half of the repeat.** A changed key on the single
 *    element this component returns makes React unmount the old `Text` and
 *    mount a new one, which is the remounting alert this repository already
 *    documents as Android's re-speak path (architecture §10). `CraftInlineError`
 *    itself stays mounted, so the hook's refs — and its first-render rule —
 *    survive across the remount. iOS needs no remount: VoiceOver never reads a
 *    live region, so `useAnnouncement` speaks the repeat instead.
 * 2. **`nativeID` carries the same value, because `key` is invisible to the
 *    test harness.** RNTL renders an identical tree either side of a key
 *    change; `nativeID` is a plain view prop, never spoken and never drawn, and
 *    is the assertable carrier of the identity the remount is derived from. It
 *    is scoped by `useId` as well as by the attempt, because two of these share
 *    one counter wherever a submit validates two fields at once
 *    (`AddGuideStepField`, `GuideStepEditorRow`) and would otherwise render the
 *    same id twice (PR #69 verify finding 5).
 * 3. **It renders `null`, not an empty `Text`.** An always-mounted empty alert
 *    would occupy a `gap-3` slot in every one of these column layouts and would
 *    expose an empty `alert` element to both screen readers.
 *
 * `CraftAnnouncement` remains the primitive for a *persistent* status line that
 * stays mounted with `''` when there is nothing to say; the two are thin presets
 * over the one shared seam, `useAnnouncement`.
 */
export function CraftInlineError({ attempt, message }: CraftInlineErrorProps) {
  // Unique per mounted instance, so two error lines driven by one attempt
  // counter never render the same `nativeID`.
  const instance = useId();
  // Unconditional: the hook's memory has to survive the message clearing, so a
  // caller renders this element unconditionally too.
  useAnnouncement(message, attempt);

  if (message === undefined || message === '') {
    return null;
  }

  return (
    <Text
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      className="text-label text-pinkStrong"
      key={`attempt-${attempt}`}
      nativeID={`craft-inline-error-${instance}-${attempt}`}
    >
      {message}
    </Text>
  );
}
