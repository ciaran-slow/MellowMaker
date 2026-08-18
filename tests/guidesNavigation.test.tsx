import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';

import { createAppDatabase } from '@/platform/database/createAppDatabase';

import { getLastYoutubeProps } from './support/youtubeIframeMock';

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

  it('releases the player on navigating away — a stale callback after unmount is a no-op (NFR-10)', async () => {
    const database = await createAppDatabase();
    const created = database.repositories.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Amigurumi Basics',
      },
      steps: [{ instruction: 'Make a magic ring', origin: 'user' }],
    });

    const result = renderRouter(routes, {
      initialUrl: `/guides/${created.guide.id}`,
    });
    await result;

    await screen.findByRole('header', { name: 'Amigurumi Basics' });

    // Capture the mounted player's error callback, then navigate away so the
    // working view (and its player) unmount.
    const staleOnError = getLastYoutubeProps()?.onError;
    expect(staleOnError).toBeDefined();

    await fireEvent.press(screen.getByLabelText('Back to guides'));

    // The working view (and its player) unmount when we leave the route.
    await waitFor(() => {
      expect(
        screen.queryByRole('header', { name: 'Amigurumi Basics' }),
      ).not.toBeOnTheScreen();
    });
    expect(result.getPathname()).not.toBe(`/guides/${created.guide.id}`);

    // The captured callback fires after unmount: the mounted-flag guard makes it
    // a no-op rather than a state update on an unmounted component.
    expect(() => staleOnError?.('HTML5_error')).not.toThrow();
  });
});
