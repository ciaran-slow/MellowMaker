import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import type { GuideMetadataUnavailableReason } from '@/data/contracts/guideMetadataGateway';
import type { GuideInput } from '@/data/contracts/guideRepository';
import { validateGuideTitle } from '@/domain/guides/guideDraft';
import {
  normalizeYoutubeUrl,
  type YoutubeUrlRejection,
} from '@/domain/guides/youtubeUrl';
import { useRepositories } from '@/ui/database/useRepositories';
import { useGuideMetadataGateway } from '@/ui/guides/useGuideMetadataGateway';

export type ImportPhase =
  /** Editing the URL; `urlError` present after a rejected submit. */
  | { readonly kind: 'input'; readonly urlError?: YoutubeUrlRejection }
  /** Looking up metadata over the network. */
  | { readonly kind: 'fetching' }
  /** The video is already imported; offer to open the existing guide. */
  | {
      readonly kind: 'duplicate';
      readonly guideId: string;
      readonly title: string;
    }
  /** Staged for an explicit Create tap. Reaching this state writes nothing. */
  | {
      readonly kind: 'review';
      readonly videoId: string;
      readonly sourceUrl: string;
      readonly metadata:
        | 'ok'
        | { readonly unavailable: GuideMetadataUnavailableReason };
      /** Seed values for the editable fields; blank when metadata is unavailable. */
      readonly prefillTitle: string;
      readonly prefillCreator: string;
      readonly thumbnailUrl?: string;
      /** Set only when metadata resolved `ok`. */
      readonly metadataSyncedAt?: number;
    };

export interface GuideDraft {
  readonly title: string;
  readonly creator: string | undefined;
}

export interface GuideImport {
  readonly phase: ImportPhase;
  submitUrl(raw: string): void;
  /** The only write path: commits the staged guide (FR-YT-06 explicit consent). */
  createGuide(draft: GuideDraft): void;
  retryFetch(): void;
  resetToInput(): void;
}

/**
 * Drives the paste → normalize → dedup → fetch → stage → create state machine.
 * Normalization and dedup happen before any network call or write, so a rejected
 * link and an already-imported video both create nothing. A network failure
 * resolves to a `review` phase with blank editable fields, never a crash, so the
 * maker can always continue manually.
 */
export function useGuideImport(): GuideImport {
  const { guides } = useRepositories();
  const gateway = useGuideMetadataGateway();
  const router = useRouter();
  const [phase, setPhase] = useState<ImportPhase>({ kind: 'input' });
  const targetRef = useRef<
    { readonly videoId: string; readonly sourceUrl: string } | undefined
  >(undefined);
  // Monotonic id so a stale fetch response can never overwrite a newer phase.
  const requestRef = useRef(0);

  const runFetch = useCallback(
    (videoId: string, sourceUrl: string) => {
      const requestId = (requestRef.current += 1);
      setPhase({ kind: 'fetching' });

      const stageUnavailable = (reason: GuideMetadataUnavailableReason) => {
        if (requestRef.current !== requestId) {
          return;
        }
        setPhase({
          kind: 'review',
          videoId,
          sourceUrl,
          metadata: { unavailable: reason },
          prefillTitle: '',
          prefillCreator: '',
        });
      };

      void gateway.fetchMetadata(videoId).then((result) => {
        if (requestRef.current !== requestId) {
          return;
        }
        if (result.status === 'ok') {
          setPhase({
            kind: 'review',
            videoId,
            sourceUrl,
            metadata: 'ok',
            prefillTitle: result.metadata.title ?? '',
            prefillCreator: result.metadata.creator ?? '',
            ...(result.metadata.thumbnailUrl === undefined
              ? {}
              : { thumbnailUrl: result.metadata.thumbnailUrl }),
            metadataSyncedAt: Date.now(),
          });
        } else {
          stageUnavailable(result.reason);
        }
      }, () => {
        // The gateway is contracted never to reject; guard defensively anyway.
        stageUnavailable('offline');
      });
    },
    [gateway],
  );

  const submitUrl = useCallback(
    (raw: string) => {
      const normalized = normalizeYoutubeUrl(raw);
      if (!normalized.ok) {
        // No network, no write for a rejected link (FR-YT-02).
        targetRef.current = undefined;
        setPhase({ kind: 'input', urlError: normalized.reason });

        return;
      }

      // Dedup before any network or write (FR-YT-03).
      const existing = guides.findGuideByVideoId(normalized.videoId);
      if (existing !== undefined) {
        targetRef.current = undefined;
        setPhase({
          kind: 'duplicate',
          guideId: existing.guide.id,
          title: existing.guide.title,
        });

        return;
      }

      targetRef.current = {
        videoId: normalized.videoId,
        sourceUrl: normalized.canonicalUrl,
      };
      runFetch(normalized.videoId, normalized.canonicalUrl);
    },
    [guides, runFetch],
  );

  const retryFetch = useCallback(() => {
    const target = targetRef.current;
    if (target === undefined) {
      return;
    }
    runFetch(target.videoId, target.sourceUrl);
  }, [runFetch]);

  const createGuide = useCallback(
    (draft: GuideDraft) => {
      if (phase.kind !== 'review') {
        return;
      }

      const titleResult = validateGuideTitle(draft.title);
      if (!titleResult.ok) {
        return;
      }

      const guide: GuideInput = {
        videoId: phase.videoId,
        sourceUrl: phase.sourceUrl,
        title: titleResult.value,
        ...(draft.creator === undefined ? {} : { creator: draft.creator }),
        ...(phase.thumbnailUrl === undefined
          ? {}
          : { thumbnailUrl: phase.thumbnailUrl }),
        ...(phase.metadataSyncedAt === undefined
          ? {}
          : { metadataSyncedAt: phase.metadataSyncedAt }),
      };

      const saved = guides.saveImportedGuide({ guide, steps: [] });

      router.replace({
        pathname: '/guides/[guideId]',
        params: { guideId: saved.guide.id },
      });
    },
    [phase, guides, router],
  );

  const resetToInput = useCallback(() => {
    targetRef.current = undefined;
    // Drop any in-flight fetch so its late response cannot revive a stale phase.
    requestRef.current += 1;
    setPhase({ kind: 'input' });
  }, []);

  return { phase, submitUrl, createGuide, retryFetch, resetToInput };
}
