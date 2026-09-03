import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';

import type { PatternSummary } from '@/data/contracts/patternRepository';
import { createAppDatabase } from '@/platform/database/createAppDatabase';

const routes = 'src/app';

function libraryTitles(): readonly string[] {
  return (
    screen.getByTestId('pattern-results').props.data as readonly PatternSummary[]
  ).map((pattern) => pattern.title);
}

describe('patterns navigation', () => {
  it('creates a pattern, lands on the viewer, and shows it above the bundled starters', async () => {
    const result = renderRouter(routes, { initialUrl: '/patterns' });
    await result;

    // The composition root seeds the bundled starters, so a fresh install is
    // never empty and "Create your first pattern" (which lives only in the
    // list's empty component) is not on screen. The always-present "New
    // pattern" action is the way in.
    expect(await screen.findByLabelText(/^Practice Swatch/)).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'Create your first pattern' }),
    ).not.toBeOnTheScreen();

    await fireEvent.press(
      await screen.findByRole('button', { name: 'New pattern' }),
    );

    await screen.findByRole('header', { name: 'New pattern' });
    await fireEvent.changeText(
      screen.getByLabelText('Pattern title'),
      'Meadow Wrap',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Create pattern' }),
    );

    // Creating replaces the route with the working viewer (Journey B), not the
    // editor: the pattern title is the viewer header and there is no editor.
    await screen.findByRole('header', { name: 'Meadow Wrap' });
    expect(
      screen.queryByRole('header', { name: 'Edit pattern' }),
    ).not.toBeOnTheScreen();

    // Return to the library through the Patterns tab and confirm the focus
    // reload surfaces the newly created pattern.
    await fireEvent.press(screen.getByRole('tab', { name: 'Patterns' }));

    await waitFor(() => {
      expect(result.getPathname()).toBe('/patterns');
    });
    expect(await screen.findByLabelText('Meadow Wrap')).toBeOnTheScreen();
    // Recency puts the maker's brand-new pattern above every bundled starter.
    expect(libraryTitles()).toStrictEqual([
      'Meadow Wrap',
      'Practice Swatch',
      'Cotton Dishcloth',
      'Ridged Coaster',
      'Granny Square',
      'Ribbed Headband',
      'Simple Scarf',
    ]);
  });

  it('opens the viewer for a chosen library row', async () => {
    const database = await createAppDatabase();
    const created = database.repositories.patterns.createPattern({
      title: 'Sky Scarf',
      steps: ['Chain 20'],
    });

    const result = renderRouter(routes, { initialUrl: '/patterns' });
    await result;

    await fireEvent.press(await screen.findByLabelText('Sky Scarf'));

    await waitFor(() => {
      expect(result.getPathname()).toBe(`/patterns/${created.pattern.id}`);
    });
    // The viewer, not the editor: the pattern title is the header and the step
    // renders with its viewer status label.
    expect(
      await screen.findByRole('header', { name: 'Sky Scarf' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Step 1 of 1, current step: Chain 20'),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('header', { name: 'Edit pattern' }),
    ).not.toBeOnTheScreen();
  });

  it('opens the editor from the viewer via Edit pattern', async () => {
    const database = await createAppDatabase();
    const created = database.repositories.patterns.createPattern({
      title: 'Sky Scarf',
      steps: ['Chain 20'],
    });

    const result = renderRouter(routes, {
      initialUrl: `/patterns/${created.pattern.id}`,
    });
    await result;

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Edit pattern' }),
    );

    await waitFor(() => {
      expect(result.getPathname()).toBe(
        `/patterns/${created.pattern.id}/edit`,
      );
    });
    expect(
      await screen.findByRole('header', { name: 'Edit pattern' }),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 1 of 1: Chain 20')).toBeOnTheScreen();
  });

  it('resolves /patterns/new to create mode, not an editor for a pattern named new', async () => {
    await renderRouter(routes, { initialUrl: '/patterns/new' });

    expect(
      await screen.findByRole('header', { name: 'New pattern' }),
    ).toBeOnTheScreen();
    // A wrong route precedence would open [patternId] with patternId "new",
    // look it up, find nothing, and show the missing-pattern card instead.
    expect(
      screen.queryByRole('header', { name: 'This pattern is no longer here' }),
    ).not.toBeOnTheScreen();
    expect(
      screen.queryByRole('header', { name: 'Edit pattern' }),
    ).not.toBeOnTheScreen();
  });

  it('never grows a fourth tab for a patterns child route', async () => {
    await renderRouter(routes, { initialUrl: '/patterns/new' });

    expect(
      await screen.findByRole('header', { name: 'New pattern' }),
    ).toBeOnTheScreen();
    expect(
      screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel),
    ).toStrictEqual(['Stitches', 'Patterns', 'Guides']);
  });
});
