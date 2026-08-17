import type { GuideMetadataUnavailableReason } from '@/data/contracts/guideMetadataGateway';
import type { YoutubeUrlRejection } from '@/domain/guides/youtubeUrl';
import {
  metadataUnavailableMessages,
  urlRejectionMessages,
} from '@/features/guides/presentation/guideImportLabels';

const URL_REJECTIONS: readonly YoutubeUrlRejection[] = [
  'empty',
  'invalid-url',
  'not-youtube',
  'no-video-id',
  'invalid-video-id',
];

const UNAVAILABLE_REASONS: readonly GuideMetadataUnavailableReason[] = [
  'offline',
  'timeout',
  'not-found',
  'provider-error',
  'malformed-response',
];

describe('guide import labels', () => {
  it('gives every URL rejection a non-empty, distinct message', () => {
    const messages = URL_REJECTIONS.map((reason) => {
      const message = urlRejectionMessages[reason];
      expect(typeof message).toBe('string');
      expect(message.trim().length).toBeGreaterThan(0);

      return message;
    });

    // A bug that collapses two reasons to one message fails here.
    expect(new Set(messages).size).toBe(URL_REJECTIONS.length);
  });

  it('gives every metadata-unavailable reason a non-empty, distinct message', () => {
    const messages = UNAVAILABLE_REASONS.map((reason) => {
      const message = metadataUnavailableMessages[reason];
      expect(typeof message).toBe('string');
      expect(message.trim().length).toBeGreaterThan(0);

      return message;
    });

    expect(new Set(messages).size).toBe(UNAVAILABLE_REASONS.length);
  });
});
