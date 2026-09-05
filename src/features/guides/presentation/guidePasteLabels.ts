import { formatStepTimestamp } from '@/domain/guides/guideStepDraft';
import type { PastedStepsRejection } from '@/domain/guides/pastedGuideSteps';

/**
 * Human copy for the paste classifier's stable reason codes, mirroring
 * `guideImportLabels.ts`: the domain stays copy-free and presentation owns the
 * actionable wording. Each message is distinct, so a bug collapsing two reasons
 * onto one message is caught by a test.
 *
 * **No message interpolates any of the maker's pasted text** (NFR-12). The paste
 * is maker content: it is never logged and never placed in an error body, so
 * every entry below is a fixed string.
 */
export const pasteRejectionMessages: Record<PastedStepsRejection, string> = {
  empty: 'Paste the video description or transcript text first.',
  'too-long':
    'That paste is too long. Copy just the chapter list, or a shorter part of the transcript.',
  'no-timestamps':
    "We couldn't find any timestamps in that text. Copy the description's chapter list, or the transcript panel, and try again.",
  'no-step-text':
    'We found timestamps but no step text. Copy the chapter labels or transcript lines too.',
  'too-many-steps':
    'That paste makes too many steps. Copy a shorter part of the transcript and try again.',
};

export function pasteRejectionMessage(reason: PastedStepsRejection): string {
  return pasteRejectionMessages[reason];
}

/** The polite live-region line announcing how many draft steps are up for review. */
export function pasteReviewSummaryLabel(count: number): string {
  return count === 1
    ? '1 step ready to review from your paste.'
    : `${count} steps ready to review from your paste.`;
}

/** The confirm control's accessible name, which also states the count. */
export function pasteConfirmLabel(count: number): string {
  return count === 1 ? 'Add 1 step' : `Add ${count} steps`;
}

/**
 * One draft row's spoken name — the same shape as `editorStepAccessibilityLabel`
 * so a reviewed step and a saved step read alike.
 */
export function pasteReviewStepLabel(
  index: number,
  total: number,
  instruction: string,
  videoOffsetMs: number | undefined,
): string {
  const clause =
    videoOffsetMs === undefined
      ? ''
      : ` at ${formatStepTimestamp(videoOffsetMs)}`;

  return `Step ${index + 1} of ${total}${clause}: ${instruction}`;
}
