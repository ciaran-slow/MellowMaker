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

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Maps a raw oEmbed body into the owned metadata type. Only the four safe string
 * fields are read; each is kept only when it is actually a string, else left
 * `undefined`. The provider `html`/`width`/`height` embed snippet is ignored and
 * never returned, so provider markup can never be surfaced or rendered (FR-GU-07
 * boundary; NFR-12), and no transcript field exists to claim (FR-YT-08). Exported
 * for direct unit testing.
 */
export function mapOembedResponse(body: unknown): GuideMetadata {
  const source =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};

  return {
    title: readString(source.title),
    creator: readString(source.author_name),
    creatorUrl: readString(source.author_url),
    thumbnailUrl: readString(source.thumbnail_url),
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
