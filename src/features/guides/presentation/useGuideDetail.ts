import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { GuideMetadataUnavailableReason } from '@/data/contracts/guideMetadataGateway';
import type { GuideStep, ImportedGuide } from '@/data/contracts/guideRepository';
import { useRepositories } from '@/ui/database/useRepositories';
import { useGuideMetadataGateway } from '@/ui/guides/useGuideMetadataGateway';

export type GuideDetailStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  /** The id resolved to no row — a stale link or a just-deleted guide. */
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'ready';
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

export interface GuideDetail {
  readonly status: GuideDetailStatus;
  readonly refresh: RefreshStatus;
  retry(): void;
  refreshMetadata(): void;
  remove(): void;
}

/**
 * Loads one guide and drives its metadata refresh and deletion. A refresh writes
 * only when the provider returns metadata; an unavailable result performs **no
 * write**, so the rendered guide and its future steps stay byte-for-byte
 * unchanged (FR-DA-05, NFR-04). SQLite is the one authoritative copy: every
 * mutation re-reads it.
 */
export function useGuideDetail(guideId: string): GuideDetail {
  const { guides } = useRepositories();
  const gateway = useGuideMetadataGateway();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<GuideDetailStatus>({ kind: 'loading' });
  const [refresh, setRefresh] = useState<RefreshStatus>({ kind: 'idle' });
  // Monotonic id so a stale refresh response cannot land on a newer state.
  const refreshRef = useRef(0);

  const load = useCallback(() => {
    const loaded = guides.getGuideWithSteps(guideId);
    setStatus(
      loaded === undefined
        ? { kind: 'not-found' }
        : { kind: 'ready', guide: loaded.guide, steps: loaded.steps },
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
        setStatus({ kind: 'failed' });
      }
    });

    return () => {
      current = false;
    };
  }, [attempt, load]);

  const retry = useCallback(() => {
    setStatus({ kind: 'loading' });
    setAttempt((previous) => previous + 1);
  }, []);

  const refreshMetadata = useCallback(() => {
    if (status.kind !== 'ready') {
      return;
    }

    const { videoId } = status.guide;
    const requestId = (refreshRef.current += 1);
    setRefresh({ kind: 'refreshing' });

    void gateway.fetchMetadata(videoId).then((result) => {
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
          setStatus({ kind: 'failed' });
          setRefresh({ kind: 'idle' });
        }
      } else {
        // No write: the saved guide is left byte-for-byte unchanged (NFR-04).
        setRefresh({ kind: 'unavailable', reason: result.reason });
      }
    }, () => {
      if (refreshRef.current !== requestId) {
        return;
      }
      setRefresh({ kind: 'unavailable', reason: 'offline' });
    });
  }, [status, gateway, guides, guideId, load]);

  const remove = useCallback(() => {
    guides.deleteGuide(guideId);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/guides');
    }
  }, [guides, guideId, router]);

  return { status, refresh, retry, refreshMetadata, remove };
}
