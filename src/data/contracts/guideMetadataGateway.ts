/**
 * The MellowMaker-owned metadata types a feature receives. Provider payloads are
 * mapped into these at the platform boundary (architecture §5.3) so feature and
 * UI code never touch a raw YouTube response.
 */

export interface GuideMetadata {
  readonly title: string | undefined;
  readonly creator: string | undefined;
  readonly creatorUrl: string | undefined;
  readonly thumbnailUrl: string | undefined;
  // NOTE: there is deliberately NO transcript field. The app cannot claim a
  // transcript exists because the owned type cannot represent one (FR-YT-08).
  // The provider `html` embed snippet is likewise never mapped in, so it can
  // never be returned or rendered as markup (FR-GU-07 boundary; NFR-12).
}

export type GuideMetadataUnavailableReason =
  /** `fetch` threw — no connectivity / DNS failure. */
  | 'offline'
  /** The request timed out and was aborted. */
  | 'timeout'
  /** 404 — a private, removed, or non-existent video. */
  | 'not-found'
  /** Any other non-2xx provider response. */
  | 'provider-error'
  /** 2xx, but the body is not the expected JSON object shape. */
  | 'malformed-response';

export type FetchGuideMetadataResult =
  | { readonly status: 'ok'; readonly metadata: GuideMetadata }
  | {
      readonly status: 'unavailable';
      readonly reason: GuideMetadataUnavailableReason;
    };

/**
 * Fetches provider metadata for a canonical video id. Every failure resolves to
 * an `unavailable` result — it never throws into the UI — so an import or refresh
 * always degrades to manual entry rather than crashing.
 */
export interface GuideMetadataGateway {
  fetchMetadata(videoId: string): Promise<FetchGuideMetadataResult>;
}
