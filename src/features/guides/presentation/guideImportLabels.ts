import type { GuideMetadataUnavailableReason } from '@/data/contracts/guideMetadataGateway';
import type { YoutubeUrlRejection } from '@/domain/guides/youtubeUrl';

/**
 * Human copy for the stable domain/gateway reason codes. The domain and gateway
 * stay copy-free (they return codes); presentation owns the actionable wording so
 * a maker is told how to correct the problem, and each message is distinct so a
 * bug that collapses two reasons to one message is caught by a test.
 */
export const urlRejectionMessages: Record<YoutubeUrlRejection, string> = {
  empty: 'Paste a YouTube link to import a guide.',
  'invalid-url': "That doesn't look like a link. Paste the full YouTube URL.",
  'not-youtube':
    "That link isn't a YouTube video. Paste a YouTube watch, share, Shorts, embed, or live link.",
  'no-video-id':
    "That's a YouTube page but not a single video. Open the video first, then copy its link.",
  'invalid-video-id':
    "That looks like a YouTube link but the video id isn't valid. Copy the link straight from the video.",
};

export function urlRejectionMessage(reason: YoutubeUrlRejection): string {
  return urlRejectionMessages[reason];
}

/**
 * Every reason degrades to the same behaviour — fields blank and editable, manual
 * creation proceeds — so this copy only tunes the note a maker sees, never blocks
 * them (FR-YT-05/06).
 */
export const metadataUnavailableMessages: Record<
  GuideMetadataUnavailableReason,
  string
> = {
  offline:
    "We couldn't reach YouTube — you can still create this guide by adding a title.",
  timeout:
    'Looking up this video took too long — you can still create this guide by adding a title.',
  'not-found':
    "We couldn't find details for this video — you can still create this guide by adding a title.",
  'provider-error':
    "YouTube didn't send details this time — you can still create this guide by adding a title.",
  'malformed-response':
    "We couldn't read the details from YouTube — you can still create this guide by adding a title.",
};

export function metadataUnavailableMessage(
  reason: GuideMetadataUnavailableReason,
): string {
  return metadataUnavailableMessages[reason];
}
