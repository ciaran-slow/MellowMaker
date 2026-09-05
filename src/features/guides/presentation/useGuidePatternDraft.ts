import { useCallback, useEffect, useRef, useState } from 'react';

import {
  guidePatternSnapshot,
  type PatternSnapshotDraft,
} from '@/domain/guides/guidePatternSnapshot';
import { useRepositories } from '@/ui/database/useRepositories';

export type GuidePatternDraftState =
  | { readonly status: 'loading' }
  /** The id resolved to no row — a stale link or a just-deleted guide. */
  | { readonly status: 'missing' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly draft: PatternSnapshotDraft };

export interface GuidePatternDraft {
  readonly state: GuidePatternDraftState;
  retry(): void;
  /**
   * Commits the reviewed snapshot as a new pattern and returns its id, or
   * `undefined` when the write failed (the state then reports `failed`).
   */
  save(title: string): string | undefined;
}

/**
 * Drives the "Save as pattern" review screen. It reads the guide once through
 * the shipped `getGuideWithSteps` — every step, whatever its `origin`, in
 * position order — derives the pure `guidePatternSnapshot`, and on explicit
 * confirm commits it through the shipped `PatternRepository.createPattern`,
 * which writes the pattern and all of its steps in one transaction.
 *
 * Two deliberate properties:
 *
 * - **Nothing is written before `save`.** Loading a review is a read.
 * - **`save` does not re-read the guide.** The draft committed is the draft the
 *   maker reviewed, so a guide edited elsewhere between review and confirm
 *   cannot silently change what was approved. The result is a snapshot, not a
 *   link: no `source_guide_id`, no foreign key, no migration (§9.3).
 *
 * Converting the same guide twice is deliberately **not** idempotent: each
 * confirm creates an independent pattern, because a maker may fork a project and
 * the only available dedupe key (the title or the notes URL) is editable
 * afterwards.
 */
export function useGuidePatternDraft(guideId: string): GuidePatternDraft {
  const { guides, patterns } = useRepositories();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<GuidePatternDraftState>({
    status: 'loading',
  });
  // The reviewed draft, read by `save` rather than through a React closure, so
  // the commit always writes exactly what the ready state rendered.
  const draftRef = useRef<PatternSnapshotDraft | undefined>(undefined);

  useEffect(() => {
    let current = true;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        const loaded = guides.getGuideWithSteps(guideId);
        if (loaded === undefined) {
          draftRef.current = undefined;
          setState({ status: 'missing' });

          return;
        }

        const draft = guidePatternSnapshot({
          videoId: loaded.guide.videoId,
          title: loaded.guide.title,
          notes: loaded.guide.notes,
          steps: loaded.steps,
        });
        draftRef.current = draft;
        setState({ status: 'ready', draft });
      } catch {
        setState({ status: 'failed' });
      }
    });

    return () => {
      current = false;
    };
  }, [attempt, guideId, guides]);

  const save = useCallback(
    (title: string): string | undefined => {
      const draft = draftRef.current;
      if (draft === undefined) {
        return undefined;
      }

      try {
        return patterns.createPattern({
          title,
          notes: draft.notes,
          steps: draft.steps,
        }).pattern.id;
      } catch {
        setState({ status: 'failed' });

        return undefined;
      }
    },
    [patterns],
  );

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }, []);

  return { state, retry, save };
}
