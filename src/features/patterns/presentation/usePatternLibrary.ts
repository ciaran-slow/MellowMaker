import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_PAGE_LIMIT } from '@/data/contracts/page';
import type { PatternSummary } from '@/data/contracts/patternRepository';
import { useRepositories } from '@/ui/database/useRepositories';

export type PatternLibraryState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | {
      readonly status: 'ready';
      readonly patterns: readonly PatternSummary[];
      /** The last page came back short, so there is nothing left to append. */
      readonly exhausted: boolean;
      readonly loadingMore: boolean;
    };

export interface PatternLibrary {
  readonly state: PatternLibraryState;
  loadMore(): void;
  retry(): void;
  /**
   * Re-reads the first page without flashing the loading state, so returning to
   * a focused library reflects patterns created, edited, or deleted elsewhere.
   */
  reload(): void;
}

/**
 * Reads one bounded page of patterns per request and appends further pages on
 * demand, so a long library is never copied into memory at once (NFR-09). It
 * mirrors `useStitchCatalog`: reads are scheduled from an effect rather than run
 * in its body, and a post-ready read failure is screen-local and retryable —
 * `DatabaseGate` already proved the database opens.
 *
 * Patterns are ordered by the repository's recency window (`updated_at DESC`),
 * the single recorded PRD0 organization method.
 */
export function usePatternLibrary(): PatternLibrary {
  const { patterns } = useRepositories();
  const [token, setToken] = useState(0);
  const [state, setState] = useState<PatternLibraryState>({
    status: 'loading',
  });

  useEffect(() => {
    let current = true;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        const page = patterns.listPatterns({
          limit: DEFAULT_PAGE_LIMIT,
          offset: 0,
        });

        setState({
          status: 'ready',
          patterns: page,
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
  }, [token, patterns]);

  useEffect(() => {
    if (state.status !== 'ready' || !state.loadingMore) {
      return;
    }

    let current = true;
    const offset = state.patterns.length;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        const page = patterns.listPatterns({
          limit: DEFAULT_PAGE_LIMIT,
          offset,
        });

        setState((previous) =>
          previous.status === 'ready' && previous.loadingMore
            ? {
                status: 'ready',
                patterns: [...previous.patterns, ...page],
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
  }, [state, patterns]);

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
    // Re-runs the first-page effect. The loading state is left untouched so a
    // focused, already-loaded list refreshes in place rather than blinking.
    setToken((previous) => previous + 1);
  }, []);

  return { state, loadMore, retry, reload };
}
