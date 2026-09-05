import type { PastedStepsRejection } from '@/domain/guides/pastedGuideSteps';
import {
  pasteConfirmLabel,
  pasteRejectionMessage,
  pasteRejectionMessages,
  pasteReviewStepLabel,
  pasteReviewSummaryLabel,
} from '@/features/guides/presentation/guidePasteLabels';

/** Written out here rather than derived, so a new reason must be added twice. */
const REJECTIONS: readonly PastedStepsRejection[] = [
  'empty',
  'too-long',
  'no-timestamps',
  'no-step-text',
  'too-many-steps',
];

describe('guide paste labels', () => {
  it('gives every rejection a non-empty, distinct message', () => {
    const messages = REJECTIONS.map((reason) => {
      const message = pasteRejectionMessages[reason];
      expect(typeof message).toBe('string');
      expect(message.trim().length).toBeGreaterThan(0);

      return message;
    });

    // A bug that collapses two reasons to one message fails here.
    expect(new Set(messages).size).toBe(REJECTIONS.length);
    expect(Object.keys(pasteRejectionMessages).sort()).toStrictEqual(
      [...REJECTIONS].sort(),
    );
  });

  it('never leaves a placeholder token in a message (NFR-12: no maker text)', () => {
    for (const reason of REJECTIONS) {
      // Every message is a fixed string: nothing the maker pasted is
      // interpolated into an error body.
      expect(pasteRejectionMessage(reason)).not.toMatch(/[{}$%]|\bundefined\b/);
    }
  });

  it('uses the singular for one step and the plural above one', () => {
    expect(pasteReviewSummaryLabel(1)).toBe(
      '1 step ready to review from your paste.',
    );
    expect(pasteReviewSummaryLabel(4)).toBe(
      '4 steps ready to review from your paste.',
    );
    expect(pasteConfirmLabel(1)).toBe('Add 1 step');
    expect(pasteConfirmLabel(4)).toBe('Add 4 steps');
  });

  it('names a review row by ordinal, timestamp, and instruction', () => {
    expect(pasteReviewStepLabel(0, 4, 'Materials', 0)).toBe(
      'Step 1 of 4 at 0:00: Materials',
    );
    expect(pasteReviewStepLabel(1, 4, 'Magic ring', 72000)).toBe(
      'Step 2 of 4 at 1:12: Magic ring',
    );
    // A draft with no time code drops the clause rather than saying "at
    // undefined".
    expect(pasteReviewStepLabel(2, 4, 'Round 1', undefined)).toBe(
      'Step 3 of 4: Round 1',
    );
  });
});
