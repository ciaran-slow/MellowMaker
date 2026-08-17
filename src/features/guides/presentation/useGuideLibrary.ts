import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_PAGE_LIMIT } from '@/data/contracts/page';
import type { GuideSummary } from '@/data/contracts/guideRepository';
import { useRepositories } from '@/ui/database/useRepositories';

export type GuideLibraryState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | {
      readonly status: 'ready';
      readonly guides: readonly GuideSummary[];
      /** The last page came back short, so there is nothing left to append. */
      readonly exhausted: boolean;
      readonly loadingMore: boolean;
    };

export interface GuideLibrary {
  readonly state: GuideLibraryState;
  loadMore(): void;
  retry(): void;
  /**
   * Re-reads the first page without flashing the loading state, so returning to
   * a focused library reflects guides imported, refreshed, or deleted elsewhere.
   */
  reload(): void;
}

/**
 * Reads one bounded page of guides per request and appends further pages on
 * demand (NFR-09). It mirrors `usePatternLibrary`: reads are scheduled from an
 * effect rather than run in its body, and a post-ready read failure is
 * screen-local and retryable — `DatabaseGate` already proved the database opens.
 * Saved guides read from SQLite with no network, so the library works offline.
 *
 * Guides are ordered by the repository's recency window (`updated_at DESC`).
 */
export function useGuideLibrary(): GuideLibrary {
  const { guides } = useRepositories();
  const [token, setToken] = useState(0);
  const [state, setState] = useState<GuideLibraryState>({ status: 'loading' });

  useEffect(() => {
    let current = true;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        const page = guides.listGuides({ limit: DEFAULT_PAGE_LIMIT, offset: 0 });

        setState({
          status: 'ready',
          guides: page,
          exhausted: page.length < DEFAULT_PAGE_LIMIT,
          loadingMore: false,
        });
      } catch {
        setState({ status: 'failed' });
      }
    });

    return () => {
      current = false;
    };
  }, [token, guides]);

  useEffect(() => {
    if (state.status !== 'ready' || !state.loadingMore) {
      return;
    }

    let current = true;
    const offset = state.guides.length;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        const page = guides.listGuides({ limit: DEFAULT_PAGE_LIMIT, offset });

        setState((previous) =>
          previous.status === 'ready' && previous.loadingMore
            ? {
                status: 'ready',
                guides: [...previous.guides, ...page],
                exhausted: page.length < DEFAULT_PAGE_LIMIT,
                loadingMore: false,
              }
            : previous,
        );
      } catch {
        setState({ status: 'failed' });
      }
    });

    return () => {
      current = false;
    };
  }, [state, guides]);

  const loadMore = useCallback(() => {
    setState((previous) =>
      previous.status === 'ready' &&
      !previous.exhausted &&
      !previous.loadingMore
        ? { ...previous, loadingMore: true }
        : previous,
    );
  }, []);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setToken((previous) => previous + 1);
  }, []);

  const reload = useCallback(() => {
    // Re-runs the first-page effect without touching the loading state so a
    // focused, already-loaded list refreshes in place rather than blinking.
    setToken((previous) => previous + 1);
  }, []);

  return { state, loadMore, retry, reload };
}
