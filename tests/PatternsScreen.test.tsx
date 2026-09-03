import { fireEvent, render, screen } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import { DEFAULT_PAGE_LIMIT, type Page } from '@/data/contracts/page';
import type { PatternSummary } from '@/data/contracts/patternRepository';
import { PatternsScreen } from '@/features/patterns/presentation/PatternsScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

// The isolated screen is rendered outside a navigator, so router focus and
// navigation are stubbed here; the navigation suite exercises the real router.
// `useFocusEffect` is a no-op so the library's paging call counts stay exact.
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useFocusEffect: () => {},
}));

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function tree(repositories: Repositories, mountKey = 'first') {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <PatternsScreen key={mountKey} />
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

function fakePattern(index: number): PatternSummary {
  return {
    id: `pattern-${index}`,
    title: `Pattern ${index}`,
    notes: index % 2 === 0 ? `Notes ${index}` : undefined,
    createdAt: 1_000 + index,
    updatedAt: 2_000 + index,
    origin: 'user',
  };
}

describe('PatternsScreen', () => {
  let database: TestDatabase;
  let base: Repositories;

  beforeEach(() => {
    database = createTestDatabase();
    base = database.repositories;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('shows a progress indicator while the first read runs, then the recency-ordered rows', async () => {
    const rows = [fakePattern(1), fakePattern(2)];
    const framesDuringRead: boolean[] = [];
    const repositories: Repositories = {
      ...base,
      patterns: {
        ...base.patterns,
        listPatterns: () => {
          framesDuringRead.push(
            screen.queryByLabelText('Loading your patterns') !== null,
          );

          return rows;
        },
      },
    };

    await render(tree(repositories));
    framesDuringRead.length = 0;
    await screen.rerender(tree(repositories, 'remount'));

    expect(framesDuringRead).toStrictEqual([true]);
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();

    expect(screen.getByRole('header', { name: 'Patterns' })).toBeOnTheScreen();
    expect(screen.getByText('2 patterns')).toBeOnTheScreen();
    expect(screen.getByLabelText('Pattern 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Pattern 2. Notes 2')).toBeOnTheScreen();
  });

  it('shows a creation-oriented empty state, not an error, when there are no patterns', async () => {
    const repositories: Repositories = {
      ...base,
      patterns: { ...base.patterns, listPatterns: () => [] },
    };

    await render(tree(repositories));

    expect(
      screen.getByRole('header', { name: 'No patterns yet' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Create your first pattern' }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(screen.queryByText('1 pattern')).not.toBeOnTheScreen();
  });

  it('offers a working retry instead of rows when a local read fails', async () => {
    const listPatterns = jest
      .fn<PatternSummary[], [Page?]>()
      .mockImplementationOnce(() => {
        throw new Error('simulated read failure');
      })
      .mockImplementation(() => [fakePattern(1)]);
    const repositories: Repositories = {
      ...base,
      patterns: { ...base.patterns, listPatterns },
    };

    await render(tree(repositories));

    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: "We couldn't read your patterns" }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('pattern-results')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Pattern 1')).toBeOnTheScreen();
  });

  it('appends one bounded page at a time and stops at the end of the library', async () => {
    const pool = Array.from({ length: 70 }, (_unused, index) =>
      fakePattern(index),
    );
    const calls: Page[] = [];
    const repositories: Repositories = {
      ...base,
      patterns: {
        ...base.patterns,
        listPatterns: (page?: Page) => {
          const resolved = page ?? { limit: DEFAULT_PAGE_LIMIT, offset: 0 };
          calls.push(resolved);

          return pool.slice(resolved.offset, resolved.offset + resolved.limit);
        },
      },
    };

    await render(tree(repositories));

    const list = screen.getByTestId('pattern-results');
    expect(list.props.data).toHaveLength(DEFAULT_PAGE_LIMIT);

    await fireEvent(list, 'endReached');

    const paged = screen.getByTestId('pattern-results').props
      .data as readonly PatternSummary[];
    expect(paged).toHaveLength(70);
    expect(new Set(paged.map((pattern) => pattern.id)).size).toBe(70);
    expect(calls).toStrictEqual([
      { limit: DEFAULT_PAGE_LIMIT, offset: 0 },
      { limit: DEFAULT_PAGE_LIMIT, offset: DEFAULT_PAGE_LIMIT },
    ]);

    // The short second page ends the library, so scrolling on must not re-read.
    await fireEvent(screen.getByTestId('pattern-results'), 'endReached');

    expect(calls).toHaveLength(2);
  });

  it('keeps the header, the New pattern action, and rows usable at double text size', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
    const repositories: Repositories = {
      ...base,
      patterns: { ...base.patterns, listPatterns: () => [fakePattern(1)] },
    };

    await render(tree(repositories));

    expect(screen.getByRole('header', { name: 'Patterns' })).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'New pattern' }),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Pattern 1')).toBeOnTheScreen();
  });
});
