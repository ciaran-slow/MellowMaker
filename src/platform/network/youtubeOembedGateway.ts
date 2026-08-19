import type {
  FetchGuideMetadataResult,
  GuideMetadata,
  GuideMetadataGateway,
} from '@/data/contracts/guideMetadataGateway';

/**
 * YouTube oEmbed metadata gateway (architecture §9.1). It resolves the owned
 * `GuideMetadata` from YouTube's key-free public oEmbed endpoint, so it satisfies
 * the no-embedded-secret constraint with no proxy and adds **no new dependency**:
 * it uses the platform global `fetch` + `AbortController`, both provided by React
 * Native / Expo SDK 52+ and by the Node test environment. Injecting `fetch` keeps
 * it fully testable offline.
 */

export interface YoutubeOembedGatewayDeps {
  /** Defaults to the platform global `fetch`; tests inject a fake. */
  readonly fetchFn?: typeof fetch;
  /** Milliseconds before the request is aborted. Defaults to 10 seconds. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Upper bound on displayed free-text provider fields (`title`/`creator`). A field
 * longer than this is treated as a hostile payload, not display data, and is
 * coerced to `undefined` (issue #13). It is deliberately NOT truncated — a
 * truncated hostile string is still hostile, and a partial title misleads the
 * maker about what they imported.
 */
export const MAX_METADATA_TEXT_LENGTH = 500;

/**
 * Free text kept verbatim when it is a string within the length bound, else
 * `undefined`. The value is NOT sanitized/stripped: React Native `<Text>` renders
 * it literally (never as markup), and stripping `<`/`>` would corrupt legitimate
 * titles. The only defense the boundary owes is a length bound (issue #13).
 */
function readBoundedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= MAX_METADATA_TEXT_LENGTH
    ? value
    : undefined;
}

/**
 * A provider-supplied URL kept only when it is a string that parses as an
 * absolute URL whose scheme is exactly `http:` or `https:`. Everything else —
 * `javascript:`, `data:`, `file:`, `blob:`, relative, or unparseable — coerces to
 * `undefined`, so no unsafe URI can reach an `<Image>`/`Linking.openURL` sink
 * (issue #13, FR-GU-07 boundary; NFR-12).
 */
function readHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }

  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    ? value
    : undefined;
}

/**
 * Maps a raw oEmbed body into the owned metadata type. Only the four safe fields
 * are read, each hardened at this boundary (issue #13):
 *
 * - `title`/`creator` are kept verbatim only when a string within
 *   `MAX_METADATA_TEXT_LENGTH`; oversized/non-string values coerce to `undefined`.
 * - `creatorUrl`/`thumbnailUrl` are kept only when they parse as absolute
 *   `http(s)` URLs; a `javascript:`/`data:`/relative/garbage value coerces to
 *   `undefined` so it can never reach an `<Image>` or link-out.
 *
 * The provider `html`/`width`/`height` embed snippet is ignored and never
 * returned, so provider markup can never be surfaced or rendered (FR-GU-07
 * boundary; NFR-12), and no transcript field exists to claim (FR-YT-08). Exported
 * for direct unit testing.
 */
export function mapOembedResponse(body: unknown): GuideMetadata {
  const source =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};

  return {
    title: readBoundedString(source.title),
    creator: readBoundedString(source.author_name),
    creatorUrl: readHttpUrl(source.author_url),
    thumbnailUrl: readHttpUrl(source.thumbnail_url),
  };
}

/** True for a body that can carry named fields — an object, not an array or scalar. */
function isPlainObject(body: unknown): boolean {
  return typeof body === 'object' && body !== null && !Array.isArray(body);
}

export function createYoutubeOembedGateway(
  deps: YoutubeOembedGatewayDeps = {},
): GuideMetadataGateway {
  const fetchFn = deps.fetchFn ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async fetchMetadata(videoId): Promise<FetchGuideMetadataResult> {
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const requestUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
        watchUrl,
      )}&format=json`;

      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      let response: Response;
      try {
        response = await fetchFn(requestUrl, { signal: controller.signal });
      } catch (error) {
        // An abort surfaces as a distinct timeout reason; anything else is a
        // connectivity failure. Both degrade to manual creation.
        const aborted =
          error instanceof Error && error.name === 'AbortError';

        return { status: 'unavailable', reason: aborted ? 'timeout' : 'offline' };
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 404) {
        return { status: 'unavailable', reason: 'not-found' };
      }
      if (!response.ok) {
        return { status: 'unavailable', reason: 'provider-error' };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { status: 'unavailable', reason: 'malformed-response' };
      }

      if (!isPlainObject(body)) {
        return { status: 'unavailable', reason: 'malformed-response' };
      }

      return { status: 'ok', metadata: mapOembedResponse(body) };
    },
  };
}
