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

    await waitFor(() => {
      expect(result.getPathname()).toBe('/dictionary');
    });
    expect(
      screen.getByRole('header', {
        name: 'Your stitch dictionary starts here',
      }),
    ).toBeOnTheScreen();

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
