import {
  createYoutubeOembedGateway,
  mapOembedResponse,
  MAX_METADATA_TEXT_LENGTH,
} from '@/platform/network/youtubeOembedGateway';

/** Builds a fake `fetch` returning one canned response, capturing the request. */
function stubFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL) => {
    calls.push(String(input));

    return {
      ok: response.status === undefined ? true : response.status < 400,
      status: response.status ?? 200,
      json:
        response.json ??
        (async () => ({})),
    } as Response;
  }) as unknown as typeof fetch;

  return { fetchFn, calls };
}

const OK_BODY = {
  title: 'Granny Square',
  author_name: 'Yarn Co',
  author_url: 'https://youtube.com/@yarnco',
  thumbnail_url: 'https://i.ytimg.com/x.jpg',
  html: '<iframe src="https://www.youtube.com/embed/x"></iframe>',
  width: 480,
  height: 270,
};

describe('mapOembedResponse', () => {
  it('keeps only the four safe string fields and never surfaces html or a transcript', () => {
    const metadata = mapOembedResponse(OK_BODY);

    expect(metadata).toStrictEqual({
      title: 'Granny Square',
      creator: 'Yarn Co',
      creatorUrl: 'https://youtube.com/@yarnco',
      thumbnailUrl: 'https://i.ytimg.com/x.jpg',
    });
    // Provider markup and any transcript claim must be structurally impossible.
    expect(Object.keys(metadata)).not.toContain('html');
    expect(Object.keys(metadata)).not.toContain('transcript');
    expect(JSON.stringify(metadata)).not.toContain('iframe');
  });

  it('drops non-string fields to undefined rather than crashing', () => {
    const metadata = mapOembedResponse({ title: 123, author_name: null });

    expect(metadata.title).toBeUndefined();
    expect(metadata.creator).toBeUndefined();
    expect(metadata.creatorUrl).toBeUndefined();
    expect(metadata.thumbnailUrl).toBeUndefined();
  });

  it('leaves every field undefined for an empty body', () => {
    expect(mapOembedResponse({})).toStrictEqual({
      title: undefined,
      creator: undefined,
      creatorUrl: undefined,
      thumbnailUrl: undefined,
    });
  });

  // Issue #13 (AC1 / FR-GU-07 / NFR-12): the boundary mapper hardening. Fixtures
  // are hostile literals pinned to exact expected values, not derived from the
  // mapper, so an off-by-one bound or a dropped scheme-check goes red here.
  describe('hardening: hostile / oversized / unsafe payloads', () => {
    it('keeps a markup-laden title VERBATIM as a plain string (no strip, no escape)', () => {
      const hostile = '<script>alert(1)</script>';
      const metadata = mapOembedResponse({ title: hostile });

      // The exact bytes survive — proving the boundary neither corrupts nor
      // sanitizes free text; it is `<Text>` at the render layer that keeps it
      // literal (see guideRemoteContentSafeRender.test.tsx).
      expect(metadata.title).toBe(hostile);
    });

    it('coerces an over-length title/creator to undefined but keeps the boundary length', () => {
      const atBound = 'a'.repeat(MAX_METADATA_TEXT_LENGTH);
      const overBound = 'a'.repeat(MAX_METADATA_TEXT_LENGTH + 1);

      expect(mapOembedResponse({ title: atBound }).title).toBe(atBound);
      expect(mapOembedResponse({ title: overBound }).title).toBeUndefined();
      expect(
        mapOembedResponse({ author_name: overBound }).creator,
      ).toBeUndefined();
      expect(mapOembedResponse({ author_name: atBound }).creator).toBe(atBound);
    });

    it('rejects a non-http(s) or unparseable thumbnail_url to undefined', () => {
      expect(
        mapOembedResponse({ thumbnail_url: 'javascript:alert(1)' }).thumbnailUrl,
      ).toBeUndefined();
      expect(
        mapOembedResponse({
          thumbnail_url: 'data:text/html;base64,PHNjcmlwdD4=',
        }).thumbnailUrl,
      ).toBeUndefined();
      expect(
        mapOembedResponse({ thumbnail_url: '/relative.jpg' }).thumbnailUrl,
      ).toBeUndefined();
      expect(
        mapOembedResponse({ thumbnail_url: 'not a url' }).thumbnailUrl,
      ).toBeUndefined();
      expect(
        mapOembedResponse({ thumbnail_url: 'https://i.ytimg.com/x.jpg' })
          .thumbnailUrl,
      ).toBe('https://i.ytimg.com/x.jpg');
    });

    it('rejects a non-http(s) author_url to undefined and keeps a valid one', () => {
      expect(
        mapOembedResponse({ author_url: 'javascript:void(0)' }).creatorUrl,
      ).toBeUndefined();
      expect(
        mapOembedResponse({ author_url: 'http://youtube.com/@x' }).creatorUrl,
      ).toBe('http://youtube.com/@x');
    });
  });
});

describe('createYoutubeOembedGateway.fetchMetadata', () => {
  it('maps a 200 response into owned metadata and requests the oembed endpoint', async () => {
    const { fetchFn, calls } = stubFetch({
      status: 200,
      json: async () => OK_BODY,
    });
    const gateway = createYoutubeOembedGateway({ fetchFn });

    const result = await gateway.fetchMetadata('dQw4w9WgXcQ');

    expect(result).toStrictEqual({
      status: 'ok',
      metadata: {
        title: 'Granny Square',
        creator: 'Yarn Co',
        creatorUrl: 'https://youtube.com/@yarnco',
        thumbnailUrl: 'https://i.ytimg.com/x.jpg',
      },
    });
    expect(calls[0]).toContain('https://www.youtube.com/oembed?url=');
    expect(calls[0]).toContain(encodeURIComponent('watch?v=dQw4w9WgXcQ'));
  });

  // Issue #13 (AC3 / NFR-13): the sole sanctioned network call is a pure function
  // of the PUBLIC 11-char video id and carries no maker content. #12's offline
  // suite proves core reads/writes never touch the network; this pins that the
  // one request that does exist leaks nothing. Falsifier: a mutation that
  // appended a title/notes param, or sent anything but the id, changes this URL.
  it('requests only a URL derived from the public video id, carrying no maker content', async () => {
    const { fetchFn, calls } = stubFetch({ status: 200, json: async () => OK_BODY });
    const gateway = createYoutubeOembedGateway({ fetchFn });

    await gateway.fetchMetadata('dQw4w9WgXcQ');

    const expectedUrl =
      'https://www.youtube.com/oembed?url=' +
      encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ') +
      '&format=json';
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(expectedUrl);
    expect(calls[0]).toContain('dQw4w9WgXcQ');
  });

  it('reports not-found for a 404 (private / removed video)', async () => {
    const { fetchFn } = stubFetch({ status: 404 });
    const gateway = createYoutubeOembedGateway({ fetchFn });

    expect(await gateway.fetchMetadata('dQw4w9WgXcQ')).toStrictEqual({
      status: 'unavailable',
      reason: 'not-found',
    });
  });

  it('reports provider-error for other non-2xx responses', async () => {
    const { fetchFn } = stubFetch({ status: 500 });
    const gateway = createYoutubeOembedGateway({ fetchFn });

    expect(await gateway.fetchMetadata('dQw4w9WgXcQ')).toStrictEqual({
      status: 'unavailable',
      reason: 'provider-error',
    });
  });

  it('reports offline when fetch throws', async () => {
    const fetchFn = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const gateway = createYoutubeOembedGateway({ fetchFn });

    expect(await gateway.fetchMetadata('dQw4w9WgXcQ')).toStrictEqual({
      status: 'unavailable',
      reason: 'offline',
    });
  });

  it('reports timeout when the request is aborted', async () => {
    const fetchFn = (async () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      throw error;
    }) as unknown as typeof fetch;
    const gateway = createYoutubeOembedGateway({ fetchFn });

    expect(await gateway.fetchMetadata('dQw4w9WgXcQ')).toStrictEqual({
      status: 'unavailable',
      reason: 'timeout',
    });
  });

  it('reports malformed-response when the body is not JSON', async () => {
    const { fetchFn } = stubFetch({
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    const gateway = createYoutubeOembedGateway({ fetchFn });

    expect(await gateway.fetchMetadata('dQw4w9WgXcQ')).toStrictEqual({
      status: 'unavailable',
      reason: 'malformed-response',
    });
  });

  it('reports malformed-response when the body is a JSON array, not an object', async () => {
    const { fetchFn } = stubFetch({
      status: 200,
      json: async () => [1, 2, 3],
    });
    const gateway = createYoutubeOembedGateway({ fetchFn });

    expect(await gateway.fetchMetadata('dQw4w9WgXcQ')).toStrictEqual({
      status: 'unavailable',
      reason: 'malformed-response',
    });
  });
});
