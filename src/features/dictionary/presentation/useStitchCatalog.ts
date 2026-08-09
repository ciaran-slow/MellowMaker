import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_PAGE_LIMIT } from '@/data/contracts/page';
import type { StitchSummary } from '@/data/contracts/stitchRepository';
import { useRepositories } from '@/ui/database/useRepositories';

export type StitchCatalogState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | {
      readonly status: 'ready';
      readonly stitches: readonly StitchSummary[];
      /** The last page came back short, so there is nothing left to append. */
      readonly exhausted: boolean;
      readonly loadingMore: boolean;
    };

export interface StitchCatalog {
  readonly state: StitchCatalogState;
  loadMore(): void;
  retry(): void;
}

/**
 * Reads one bounded page of stitches per request and appends further pages on
 * demand, so a long catalog is never copied into memory at once (NFR-09).
 *
 * Reads are scheduled from an effect rather than run in its body, the same way
 * `DatabaseGate` defers its synchronous SQL behind a promise: the screen's own
 * chrome and its `loading` frame reach the maker first, and `react-hooks`
 * rejects the cascading render a synchronous state update inside an effect
 * would cause. A failed read is screen-local and retryable — `DatabaseGate`
 * already proved the database opens, so a transient read error must not black
 * out the whole app.
 */
export function useStitchCatalog(query: string): StitchCatalog {
  const { stitches } = useRepositories();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<StitchCatalogState>({ status: 'loading' });

  useEffect(() => {
    // A query the maker has already moved on from must never publish its rows,
    // so a cleaned-up effect discards whatever it read.
    let current = true;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        const page = stitches.searchStitches(query, {
          limit: DEFAULT_PAGE_LIMIT,
          offset: 0,
        });

        setState({
          status: 'ready',
          stitches: page,
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
  }, [attempt, query, stitches]);

  useEffect(() => {
    if (state.status !== 'ready' || !state.loadingMore) {
      return;
    }

    let current = true;
    const offset = state.stitches.length;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        const page = stitches.searchStitches(query, {
          limit: DEFAULT_PAGE_LIMIT,
          offset,
        });

        setState((previous) =>
          // The reset effect above replaces the whole state when the query
          // changes, so a page fetched for the previous one can never be
          // appended to the new one.
          previous.status === 'ready' && previous.loadingMore
            ? {
                status: 'ready',
                stitches: [...previous.stitches, ...page],
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
  }, [query, state, stitches]);

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
    setAttempt((previous) => previous + 1);
  }, []);

  return { state, loadMore, retry };
}
