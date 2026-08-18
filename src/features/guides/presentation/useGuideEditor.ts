import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { GuideMetadataUnavailableReason } from '@/data/contracts/guideMetadataGateway';
import type {
  GuideStep,
  GuideStepAuthoringInput,
  ImportedGuide,
} from '@/data/contracts/guideRepository';
import { useRepositories } from '@/ui/database/useRepositories';
import { useGuideMetadataGateway } from '@/ui/guides/useGuideMetadataGateway';

/** Editor detail edit: `notes` may be explicitly cleared to `undefined`. */
export interface GuideDetailsDraft {
  readonly title: string;
  readonly notes: string | undefined;
}

export type GuideEditorState =
  | { readonly status: 'loading' }
  /** The id resolved to no row — a stale link or a just-deleted guide. */
  | { readonly status: 'missing' }
  | { readonly status: 'failed' }
  | {
      readonly status: 'ready';
      readonly guide: ImportedGuide;
      readonly steps: readonly GuideStep[];
    };

export type RefreshStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'refreshing' }
  /** Provider metadata was applied; announce it politely. */
  | { readonly kind: 'updated' }
  /** Fetch failed; the saved guide is unchanged. */
  | {
      readonly kind: 'unavailable';
      readonly reason: GuideMetadataUnavailableReason;
    };

export interface GuideEditor {
  readonly state: GuideEditorState;
  readonly refresh: RefreshStatus;
  retry(): void;
  saveDetails(input: GuideDetailsDraft): void;
  addStep(input: GuideStepAuthoringInput): void;
  editStep(stepId: string, input: GuideStepAuthoringInput): void;
  deleteStep(stepId: string): void;
  moveStepUp(stepId: string): void;
  moveStepDown(stepId: string): void;
  refreshMetadata(): void;
  remove(): void;
}

/**
 * Drives one guide's structural editor. Unlike the pattern editor it always has
 * an id (import already created the guide), so it loads the persisted guide with
 * the `loading | missing | failed | ready` shape and every mutation writes
 * through the repository and re-reads, keeping SQLite the one authoritative copy.
 * The metadata refresh and deletion (folded in from the retired `useGuideDetail`)
 * keep their contract: a refresh writes only when the provider returns metadata —
 * an unavailable result performs **no write**, so the saved guide and its steps
 * stay byte-for-byte unchanged (NFR-04). A post-ready read or write failure is
 * screen-local and retryable rather than a crash.
 */
export function useGuideEditor(guideId: string): GuideEditor {
  const { guides } = useRepositories();
  const gateway = useGuideMetadataGateway();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<GuideEditorState>({ status: 'loading' });
  const [refresh, setRefresh] = useState<RefreshStatus>({ kind: 'idle' });
  // Monotonic id so a stale refresh response cannot land on a newer state.
  const refreshRef = useRef(0);

  const load = useCallback(() => {
    const loaded = guides.getGuideWithSteps(guideId);
    setState(
      loaded === undefined
        ? { status: 'missing' }
        : { status: 'ready', guide: loaded.guide, steps: loaded.steps },
    );
  }, [guides, guideId]);

  useEffect(() => {
    let current = true;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        load();
      } catch {
        setState({ status: 'failed' });
      }
    });

    return () => {
      current = false;
    };
  }, [attempt, load]);

  const mutate = useCallback(
    (work: () => void) => {
      try {
        work();
        load();
      } catch {
        setState({ status: 'failed' });
      }
    },
    [load],
  );

  const saveDetails = useCallback(
    (input: GuideDetailsDraft) => {
      mutate(() => {
        guides.updateGuideDetails(
          input.notes === undefined
            ? { id: guideId, title: input.title }
            : { id: guideId, title: input.title, notes: input.notes },
        );
      });
    },
    [guideId, guides, mutate],
  );

  const addStep = useCallback(
    (input: GuideStepAuthoringInput) => {
      mutate(() => {
        guides.addGuideStep(guideId, input);
      });
    },
    [guideId, guides, mutate],
  );

  const editStep = useCallback(
    (stepId: string, input: GuideStepAuthoringInput) => {
      mutate(() => {
        guides.updateGuideStep(stepId, input);
      });
    },
    [guides, mutate],
  );

  const deleteStep = useCallback(
    (stepId: string) => {
      mutate(() => {
        guides.deleteGuideStep(stepId);
      });
    },
    [guides, mutate],
  );

  const moveStep = useCallback(
    (stepId: string, direction: -1 | 1) => {
      if (state.status !== 'ready') {
        return;
      }

      const order = state.steps.map((step) => step.id);
      const from = order.indexOf(stepId);
      const to = from + direction;
      if (from === -1 || to < 0 || to >= order.length) {
        return;
      }

      const reordered = [...order];
      const moved = reordered[from];
      const displaced = reordered[to];
      if (moved === undefined || displaced === undefined) {
        return;
      }
      reordered[from] = displaced;
      reordered[to] = moved;

      mutate(() => {
        guides.reorderGuideSteps(guideId, reordered);
      });
    },
    [state, guideId, guides, mutate],
  );

  const moveStepUp = useCallback(
    (stepId: string) => {
      moveStep(stepId, -1);
    },
    [moveStep],
  );

  const moveStepDown = useCallback(
    (stepId: string) => {
      moveStep(stepId, 1);
    },
    [moveStep],
  );

  const refreshMetadata = useCallback(() => {
    if (state.status !== 'ready') {
      return;
    }

    const { videoId } = state.guide;
    const requestId = (refreshRef.current += 1);
    setRefresh({ kind: 'refreshing' });

    void gateway.fetchMetadata(videoId).then(
      (result) => {
        if (refreshRef.current !== requestId) {
          return;
        }

        if (result.status === 'ok') {
          try {
            guides.refreshGuideMetadata(guideId, {
              ...(result.metadata.creator === undefined
                ? {}
                : { creator: result.metadata.creator }),
              ...(result.metadata.thumbnailUrl === undefined
                ? {}
                : { thumbnailUrl: result.metadata.thumbnailUrl }),
              syncedAt: Date.now(),
            });
            load();
            setRefresh({ kind: 'updated' });
          } catch {
            setState({ status: 'failed' });
            setRefresh({ kind: 'idle' });
          }
        } else {
          // No write: the saved guide is left byte-for-byte unchanged (NFR-04).
          setRefresh({ kind: 'unavailable', reason: result.reason });
        }
      },
      () => {
        if (refreshRef.current !== requestId) {
          return;
        }
        setRefresh({ kind: 'unavailable', reason: 'offline' });
      },
    );
  }, [state, gateway, guides, guideId, load]);

  const remove = useCallback(() => {
    guides.deleteGuide(guideId);
    router.replace('/guides');
  }, [guides, guideId, router]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }, []);

  return {
    state,
    refresh,
    retry,
    saveDetails,
    addStep,
    editStep,
    deleteStep,
    moveStepUp,
    moveStepDown,
    refreshMetadata,
    remove,
  };
}
