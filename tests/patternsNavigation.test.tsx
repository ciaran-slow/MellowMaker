import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';

import { createAppDatabase } from '@/platform/database/createAppDatabase';

const routes = 'src/app';

describe('patterns navigation', () => {
  it('creates a pattern from the empty state and shows it after returning to the library', async () => {
    const result = renderRouter(routes, { initialUrl: '/patterns' });
    await result;

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Create your first pattern' }),
    );

    await screen.findByRole('header', { name: 'New pattern' });
    await fireEvent.changeText(
      screen.getByLabelText('Pattern title'),
      'Meadow Wrap',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Create pattern' }),
    );

    // Creating replaces the route with the editor in edit mode.
    await screen.findByRole('header', { name: 'Edit pattern' });

    // Return to the library through the Patterns tab and confirm the focus
    // reload surfaces the newly created pattern.
    await fireEvent.press(screen.getByRole('tab', { name: 'Patterns' }));

    await waitFor(() => {
      expect(result.getPathname()).toBe('/patterns');
    });
    expect(await screen.findByLabelText('Meadow Wrap')).toBeOnTheScreen();
  });

  it('opens the editor for a chosen library row', async () => {
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
