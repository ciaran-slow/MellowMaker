import { useCallback, useEffect, useState } from 'react';

import type { StitchDetail } from '@/data/contracts/stitchRepository';
import { useRepositories } from '@/ui/database/useRepositories';

export type StitchDetailState =
  | { readonly status: 'loading' }
  /** The identifier resolved to no row — a stale link, not a fault. */
  | { readonly status: 'missing' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly stitch: StitchDetail };

export interface StitchDetailView {
  readonly state: StitchDetailState;
  retry(): void;
}

/**
 * Reads one stitch and its ordered instructions, scheduled from an effect the
 * same way `useStitchCatalog` schedules its pages. A missing row and a failed
 * read are separate states: only the second is worth offering a retry for, and
 * only the first should tell a maker the stitch is not there.
 */
export function useStitchDetail(stitchId: string): StitchDetailView {
  const { stitches } = useRepositories();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<StitchDetailState>({ status: 'loading' });

  useEffect(() => {
    let current = true;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        const stitch = stitches.getStitchDetail(stitchId);

        setState(
          stitch === undefined
            ? { status: 'missing' }
            : { status: 'ready', stitch },
        );
      } catch {
        setState({ status: 'failed' });
      }
    });

    return () => {
      current = false;
    };
  }, [attempt, stitchId, stitches]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }, []);

  return { state, retry };
}
