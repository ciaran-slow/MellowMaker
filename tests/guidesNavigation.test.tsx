import { act, within } from '@testing-library/react-native';
import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';

import { createAppDatabase } from '@/platform/database/createAppDatabase';

import {
  getLastYoutubeProps,
  mockSeekTo,
  youtubePlayerLiveCount,
} from './support/youtubeIframeMock';

const routes = 'src/app';

describe('guides navigation', () => {
  it('opens the import screen from the empty library without growing a fourth tab', async () => {
    await renderRouter(routes, { initialUrl: '/guides' });

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Import your first guide' }),
    );

    // The import route registered as a child, not a new tab.
    expect(await screen.findByLabelText('YouTube link')).toBeOnTheScreen();
    expect(
      screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel),
    ).toStrictEqual(['Stitches', 'Patterns', 'Guides']);
  });

  it('opens the detail route for a saved guide row', async () => {
    const database = await createAppDatabase();
    const created = database.repositories.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Amigurumi Basics',
        creator: 'Yarn Co',
      },
      steps: [],
    });

    const result = renderRouter(routes, { initialUrl: '/guides' });
    await result;

    await fireEvent.press(
      await screen.findByLabelText('Amigurumi Basics. By Yarn Co'),
    );

    await waitFor(() => {
      expect(result.getPathname()).toBe(`/guides/${created.guide.id}`);
    });
    expect(
      await screen.findByRole('header', { name: 'Amigurumi Basics' }),
    ).toBeOnTheScreen();
  });

  it('renders the guide route as one scroll surface, chrome included (issue #43)', async () => {
    const database = await createAppDatabase();
    const created = database.repositories.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Amigurumi Basics',
      },
      steps: [
        { instruction: 'Make a magic ring', origin: 'user' },
        { instruction: 'Chain 12', origin: 'user' },
      ],
    });

    const result = renderRouter(routes, {
      initialUrl: `/guides/${created.guide.id}`,
    });
    await result;

    // On the REAL navigation path — which the isolated screen suite cannot see —
    // the counter and the video card scroll with the steps. A route-level
    // wrapper (a `ScrollView`, or a second pinned region above the list) would
    // put them back outside it.
    await screen.findByTestId('guide-steps');
    // The counter resolves a tick after the guide, so wait for it and re-read
    // the list each attempt rather than holding a node from an earlier render.
    await waitFor(() => {
      expect(
        within(screen.getByTestId('guide-steps')).getByLabelText(
          'Increase Rows',
        ),
      ).toBeOnTheScreen();
    });
    expect(
      within(screen.getByTestId('guide-steps')).getByRole('header', {
        name: 'Amigurumi Basics',
      }),
    ).toBeOnTheScreen();
  });

  it('opens the editor from the working view and returns after deleting', async () => {
    const database = await createAppDatabase();
    const created = database.repositories.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Amigurumi Basics',
      },
      // A step so the working view shows only the header's "Edit guide" control,
      // not the empty-state CTA of the same name.
      steps: [{ instruction: 'Make a magic ring', origin: 'user' }],
    });

    const result = renderRouter(routes, {
      initialUrl: `/guides/${created.guide.id}`,
    });
    await result;

    // The working view offers "Edit guide", which pushes the editor child route.
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Edit guide' }),
    );
    await waitFor(() => {
      expect(result.getPathname()).toBe(`/guides/${created.guide.id}/edit`);
    });
    expect(
      await screen.findByRole('header', { name: 'Edit guide' }),
    ).toBeOnTheScreen();

    // Deleting from the editor returns to the guides library.
    await fireEvent.press(screen.getByRole('button', { name: 'Delete guide' }));
    await fireEvent.press(
      screen.getByRole('button', { name: 'Yes, delete guide' }),
    );
    await waitFor(() => {
      expect(result.getPathname()).toBe('/guides');
    });
    expect(
      database.repositories.guides.getGuideWithSteps(created.guide.id),
    ).toBeUndefined();
  });

  it('releases the WebView player on navigating away, even on the still-mounted replace fallback (NFR-10 / AC#4)', async () => {
    const database = await createAppDatabase();
    const created = database.repositories.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Amigurumi Basics',
      },
      steps: [{ instruction: 'Make a magic ring', origin: 'user' }],
    });

    // Landing straight on the working view means `canGoBack()` is false, so "Back
    // to guides" takes the `replace('/guides')` fallback — which, in the flat
    // bottom-tab navigator, leaves this view MOUNTED (only blurred). This is the
    // exact path that a purely unmount-tied release would miss.
    const result = renderRouter(routes, {
      initialUrl: `/guides/${created.guide.id}`,
    });
    await result;

    await screen.findByRole('header', { name: 'Amigurumi Basics' });

    // The WebView player is live while focused; drive it ready so a stale seek
    // would fire if the release did not run.
    expect(youtubePlayerLiveCount()).toBeGreaterThan(0);
    const readyBefore = getLastYoutubeProps()?.onReady;
    await act(async () => {
      readyBefore?.();
    });

    await fireEvent.press(screen.getByLabelText('Back to guides'));

    // Navigating away releases the player: the WebView is torn down (no live
    // instance) — regardless of whether the screen itself unmounted.
    await waitFor(() => {
      expect(youtubePlayerLiveCount()).toBe(0);
    });
    expect(result.getPathname()).not.toBe(`/guides/${created.guide.id}`);
  });

  it('suppresses a stale seek after navigating away (NFR-10)', async () => {
    const database = await createAppDatabase();
    const created = database.repositories.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Amigurumi Basics',
      },
      steps: [{ instruction: 'Make a magic ring', origin: 'user', videoOffsetMs: 42000 }],
    });

    const result = renderRouter(routes, {
      initialUrl: `/guides/${created.guide.id}`,
    });
    await result;

    await screen.findByRole('header', { name: 'Amigurumi Basics' });
    await act(async () => {
      getLastYoutubeProps()?.onReady?.();
    });

    await fireEvent.press(screen.getByLabelText('Back to guides'));
    await waitFor(() => {
      expect(youtubePlayerLiveCount()).toBe(0);
    });

    // A stale player callback fired after blur is a no-op, and no seek escapes.
    expect(() => getLastYoutubeProps()?.onError?.('HTML5_error')).not.toThrow();
    expect(mockSeekTo).not.toHaveBeenCalled();
  });

  it('re-arms the player on returning to a guide after navigating away (resume, NFR-10 / AC#4)', async () => {
    const database = await createAppDatabase();
    const created = database.repositories.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Amigurumi Basics',
        creator: 'Yarn Co',
      },
      steps: [{ instruction: 'Make a magic ring', origin: 'user' }],
    });

    // Land on the working view (still-mounted replace fallback), drive ready,
    // then navigate away — the blur release tears the player down.
    const result = renderRouter(routes, {
      initialUrl: `/guides/${created.guide.id}`,
    });
    await result;

    await screen.findByRole('header', { name: 'Amigurumi Basics' });
    expect(youtubePlayerLiveCount()).toBeGreaterThan(0);
    await act(async () => {
      getLastYoutubeProps()?.onReady?.();
    });
    await fireEvent.press(screen.getByLabelText('Back to guides'));
    await waitFor(() => {
      expect(youtubePlayerLiveCount()).toBe(0);
    });

    // Re-enter the SAME guide from the library. The working view stayed mounted
    // (only blurred), so refocus must fire `resume()`, re-arming a fresh live
    // player. If resume left the player inactive (never re-set `active` / bumped
    // the remount key), the count would stay 0 — the falsifier the blur→refocus
    // path needs.
    await fireEvent.press(screen.getByRole('tab', { name: 'Guides' }));
    await fireEvent.press(
      await screen.findByLabelText('Amigurumi Basics. By Yarn Co'),
    );
    await waitFor(() => {
      expect(result.getPathname()).toBe(`/guides/${created.guide.id}`);
    });
    await waitFor(() => {
      expect(youtubePlayerLiveCount()).toBeGreaterThan(0);
    });
    expect(
      await screen.findByRole('header', { name: 'Amigurumi Basics' }),
    ).toBeOnTheScreen();
  });
});
