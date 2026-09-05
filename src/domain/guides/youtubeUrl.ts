/**
 * Pure YouTube URL normalization (FR-YT-02/03; architecture §9.1). This module
 * imports nothing (lint-enforced) and does no network work, so it is unit-
 * testable at the narrowest level.
 *
 * The canonical identity of a video is its bare 11-character id. Every supported
 * form of the same video collapses to that one id, and every other part of the
 * URL — playlist, timestamp, tracking params — is discarded from identity, so
 * the same video pasted in any form never creates a duplicate guide.
 */

export type YoutubeUrlRejection =
  /** Nothing pasted, or whitespace only. */
  | 'empty'
  /** Not parseable as a URL at all. */
  | 'invalid-url'
  /** Parseable, but the host is not a supported YouTube host. */
  | 'not-youtube'
  /** A YouTube host with no extractable id (channel, @handle, playlist, results). */
  | 'no-video-id'
  /** A candidate id that fails the `[A-Za-z0-9_-]{11}` shape. */
  | 'invalid-video-id';

export type NormalizeYoutubeUrlResult =
  | {
      readonly ok: true;
      /** Canonical bare 11-char id — the identity a guide is deduplicated on. */
      readonly videoId: string;
      /** Always `https://www.youtube.com/watch?v=<videoId>`. */
      readonly canonicalUrl: string;
      /**
       * Integer seconds parsed from `t`/`start`, when present. Never part of
       * identity, and **deliberately unconsumed**: issue #50 settled that a
       * pasted `?t=` seeds no step. A `guide_step` needs a non-empty
       * instruction and `?t=` carries no text, so seeding one would make the app
       * author words the maker never typed or pasted — against `docs/vision.md`
       * §3C's maker-supplied-sources stance. The field stays on the result
       * because the parse is part of #9's recorded contract; a maker who wants a
       * step at that time types or pastes one.
       */
      readonly startSeconds: number | undefined;
    }
  | { readonly ok: false; readonly reason: YoutubeUrlRejection };

/** Hosts whose paths carry the id in a `watch?v=` or `/segment/id` layout. */
const WATCH_HOSTS: ReadonlySet<string> = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'gaming.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** Path prefixes on a watch host that place the id in the next segment. */
const PATH_ID_SEGMENTS: ReadonlySet<string> = new Set([
  'shorts',
  'embed',
  'live',
  // Legacy embed path form `youtube.com/v/ID` (carried forward from #8 review).
  'v',
]);

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * The one definition of the canonical watch-URL grammar: a bare video id becomes
 * `https://www.youtube.com/watch?v=<id>`. `normalizeYoutubeUrl` builds its
 * `canonicalUrl` from this, and the guide→pattern snapshot derives the recorded
 * source line from it, so the URL a maker sees is the same string in both places
 * rather than a second, drifting copy of the same template.
 */
export function canonicalWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** First non-empty path segment, or undefined for a bare `/` path. */
function firstSegment(pathname: string): string | undefined {
  return pathname.split('/').find((segment) => segment !== '');
}

/** Second non-empty path segment (the id after `/embed`, `/shorts`, …). */
function segmentAfterFirst(pathname: string): string | undefined {
  return pathname.split('/').filter((segment) => segment !== '')[1];
}

/** Parses an integer-second timestamp from a `t`/`start` value like `42` or `42s`. */
function parseStartSeconds(raw: string | null): number | undefined {
  if (raw === null) {
    return undefined;
  }

  const match = /^(\d+)s?$/.exec(raw.trim());
  if (match === null) {
    return undefined;
  }

  return Number.parseInt(match[1] as string, 10);
}

/**
 * Normalizes any supported YouTube link into one canonical video identity, or
 * reports a specific, actionable rejection reason. The reason codes are stable;
 * their human messages live in presentation so the domain stays copy-free.
 */
export function normalizeYoutubeUrl(raw: string): NormalizeYoutubeUrlResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, reason: 'empty' };
  }

  // Forgive pastes with no scheme (`youtube.com/watch?v=…`) rather than reject.
  const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }

  const host = url.hostname.toLowerCase();

  let candidate: string | undefined;
  if (host === 'youtu.be') {
    candidate = firstSegment(url.pathname);
  } else if (WATCH_HOSTS.has(host)) {
    if (url.pathname === '/watch') {
      candidate = url.searchParams.get('v') ?? undefined;
    } else {
      const first = firstSegment(url.pathname);
      if (first !== undefined && PATH_ID_SEGMENTS.has(first)) {
        candidate = segmentAfterFirst(url.pathname);
      } else {
        return { ok: false, reason: 'no-video-id' };
      }
    }
  } else {
    return { ok: false, reason: 'not-youtube' };
  }

  if (candidate === undefined || candidate === '') {
    return { ok: false, reason: 'no-video-id' };
  }

  // Never truncate a longer segment into an 11-char id; a wrong shape is a fault.
  if (!VIDEO_ID_PATTERN.test(candidate)) {
    return { ok: false, reason: 'invalid-video-id' };
  }

  const startSeconds =
    parseStartSeconds(url.searchParams.get('t')) ??
    parseStartSeconds(url.searchParams.get('start'));

  return {
    ok: true,
    videoId: candidate,
    canonicalUrl: canonicalWatchUrl(candidate),
    startSeconds,
  };
}
