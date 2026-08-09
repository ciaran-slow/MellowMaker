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
    expect(
      screen.getByRole('header', { name: 'Keep every project within reach' }),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Guides' }));
    await waitFor(() => {
      expect(result.getPathname()).toBe('/guides');
    });
    expect(
      screen.getByRole('header', { name: 'Turn tutorials into making steps' }),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Stitches' }));
    await waitFor(() => {
      expect(result.getPathname()).toBe('/dictionary');
    });
  });
});
