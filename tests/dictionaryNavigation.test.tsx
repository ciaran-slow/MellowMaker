import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';

import { createAppDatabase } from '@/platform/database/createAppDatabase';

const routes = 'src/app';

/**
 * The mocked `expo-sqlite` engine keys databases by name, so opening the app
 * database here hands back exactly the rows the rendered router will read.
 */
async function seededStitchId(slug: string): Promise<string> {
  const database = await createAppDatabase();

  return (
    database.repositories.stitches
      .listStitches()
      .find((stitch) => stitch.slug === slug)?.id ?? ''
  );
}

describe('dictionary navigation', () => {
  it('opens a stitch from the list and returns to it', async () => {
    const result = renderRouter(routes, { initialUrl: '/dictionary' });
    await result;

    await fireEvent.press(
      await screen.findByLabelText('Single crochet, sc, Beginner'),
    );

    expect(await screen.findByText('Abbreviation sc')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Steps' })).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Back to stitches' }),
    );

    await waitFor(() => {
      expect(result.getPathname()).toBe('/dictionary');
    });
    expect(screen.getByLabelText('Search stitches')).toBeOnTheScreen();
  });

  it('keeps the back control usable when the detail is opened directly', async () => {
    const stitchId = await seededStitchId('single-crochet');
    const result = renderRouter(routes, {
      initialUrl: `/dictionary/${stitchId}`,
    });
    await result;

    expect(await screen.findByText('Abbreviation sc')).toBeOnTheScreen();

    // Nothing precedes a deep link, so the control must fall back to the list
    // instead of doing nothing.
    await fireEvent.press(
      screen.getByRole('button', { name: 'Back to stitches' }),
    );

    await waitFor(() => {
      expect(result.getPathname()).toBe('/dictionary');
    });
    expect(screen.getByLabelText('Search stitches')).toBeOnTheScreen();
  });

  it('never grows a fourth tab for the stitch detail route', async () => {
    const stitchId = await seededStitchId('single-crochet');
    await renderRouter(routes, { initialUrl: `/dictionary/${stitchId}` });

    expect(await screen.findByText('Abbreviation sc')).toBeOnTheScreen();
    expect(
      screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel),
    ).toStrictEqual(['Stitches', 'Patterns', 'Guides']);
  });
});
