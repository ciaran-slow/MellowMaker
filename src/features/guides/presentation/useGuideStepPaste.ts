import { useCallback, useState } from 'react';

import type { GuideStepAuthoringInput } from '@/data/contracts/guideRepository';
import {
  parsePastedGuideSteps,
  type PastedStepDraft,
  type PastedStepsRejection,
  type PastedStepsSource,
} from '@/domain/guides/pastedGuideSteps';

export type PastePhase =
  /** Editing the pasted text; `error` present after a rejected review attempt. */
  | { readonly kind: 'input'; readonly error?: PastedStepsRejection }
  /** A parsed draft staged for an explicit confirm. Reaching this writes nothing. */
  | {
      readonly kind: 'review';
      readonly source: PastedStepsSource;
      readonly steps: readonly PastedStepDraft[];
    };

export interface GuideStepPaste {
  readonly phase: PastePhase;
  /** Parses only — never writes, whichever way the classification goes. */
  review(raw: string): void;
  /** The ONLY write path: appends the reviewed draft (FR-YT-06 explicit consent). */
  confirm(): void;
  /** Back to input, writing nothing — the maker's guide is untouched. */
  discard(): void;
}

/**
 * Drives the paste → parse → review → confirm state machine for guide steps,
 * the same draft-then-commit shape `PatternEditorScreen` uses in create mode and
 * `useGuideImport` uses for a new guide. The parse is synchronous and pure, so
 * there is no loading state and no failure mode other than a reason code.
 *
 * The raw paste never leaves this screen: it lives in the section's own field
 * state, only the derived instruction/excerpt text is handed to `append`, and no
 * reason code carries any of it (NFR-12/13).
 */
export function useGuideStepPaste(
  append: (steps: readonly GuideStepAuthoringInput[]) => void,
): GuideStepPaste {
  const [phase, setPhase] = useState<PastePhase>({ kind: 'input' });

  const review = useCallback((raw: string) => {
    const result = parsePastedGuideSteps(raw);
    setPhase(
      result.ok
        ? { kind: 'review', source: result.source, steps: result.steps }
        : { kind: 'input', error: result.reason },
    );
  }, []);

  const confirm = useCallback(() => {
    if (phase.kind !== 'review') {
      // Confirming outside review is a no-op: nothing has been parsed to write.
      return;
    }

    append(
      phase.steps.map((step) => ({
        instruction: step.instruction,
        ...(step.videoOffsetMs === undefined
          ? {}
          : { videoOffsetMs: step.videoOffsetMs }),
        ...(step.transcriptExcerpt === undefined
          ? {}
          : { transcriptExcerpt: step.transcriptExcerpt }),
      })),
    );
    setPhase({ kind: 'input' });
  }, [append, phase]);

  const discard = useCallback(() => {
    setPhase({ kind: 'input' });
  }, []);

  return { phase, review, confirm, discard };
}
