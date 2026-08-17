import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';

const routes = 'src/app';

describe('foundation navigation', () => {
  it('redirects to Stitches and keeps all tab labels wired to exact paths', async () => {
    const result = renderRouter(routes, { initialUrl: '/' });
    await result;

    // The real SQLite stack opens, migrates, and seeds before any tab content
    // appears, so a seeded row is the proof rather than a placeholder card.
    expect(
      await screen.findByLabelText('Single crochet, sc, Beginner'),
    ).toBeOnTheScreen();
    await waitFor(() => {
      expect(result.getPathname()).toBe('/dictionary');
    });
    await fireEvent.press(screen.getByRole('tab', { name: 'Patterns' }));
    await waitFor(() => {
      expect(result.getPathname()).toBe('/patterns');
    });
    // A fresh install has no patterns, so the creation-oriented empty state is
    // the proof the Patterns tab is live rather than a placeholder card.
    expect(
      await screen.findByRole('header', { name: 'No patterns yet' }),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Guides' }));
    await waitFor(() => {
      expect(result.getPathname()).toBe('/guides');
    });
    // A fresh install has no guides, so the import-oriented empty state is the
    // proof the Guides tab is live rather than a placeholder card.
    expect(
      await screen.findByRole('header', { name: 'No guides yet' }),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Stitches' }));
    await waitFor(() => {
      expect(result.getPathname()).toBe('/dictionary');
    });
  });
});
