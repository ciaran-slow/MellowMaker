import { fireEvent, render, screen } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import { DEFAULT_PAGE_LIMIT, type Page } from '@/data/contracts/page';
import type { StitchSummary } from '@/data/contracts/stitchRepository';
import { applyBundledStitchSeed } from '@/data/seed/stitchSeed';
import { DictionaryScreen } from '@/features/dictionary/presentation/DictionaryScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function tree(repositories: Repositories, mountKey = 'first') {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <DictionaryScreen key={mountKey} />
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

function fakeStitch(index: number): StitchSummary {
  return {
    id: `stitch-${index}`,
    slug: `stitch-${index}`,
    name: `Stitch ${index}`,
    abbreviation: `s${index}`,
    difficulty: 'beginner',
    summary: 'A stitch used for paging.',
    ownership: 'seed',
  };
}

describe('DictionaryScreen', () => {
  let database: TestDatabase;
  let seeded: Repositories;

  beforeEach(() => {
    database = createTestDatabase();
    applyBundledStitchSeed(database.repositories.stitches);
    seeded = database.repositories;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('shows a progress indicator while the first read runs, then the seeded catalog', async () => {
    const framesDuringRead: boolean[] = [];
    const repositories: Repositories = {
      ...seeded,
      stitches: {
        ...seeded.stitches,
        searchStitches: (query, page) => {
          // The read runs in a mount effect, so whatever is committed at this
          // moment is the frame a maker actually sees while it happens.
          framesDuringRead.push(
            screen.queryByLabelText('Loading your stitch dictionary') !== null,
          );

          return seeded.stitches.searchStitches(query, page);
        },
      },
    };

    // `screen` is only wired up once `render` resolves, so the observed mount is
    // the remount forced by the changed key rather than the very first one.
    await render(tree(repositories));
    framesDuringRead.length = 0;
    await screen.rerender(tree(repositories, 'remount'));

    expect(framesDuringRead).toStrictEqual([true]);
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();

    expect(screen.getByRole('header', { name: 'Stitches' })).toBeOnTheScreen();
    expect(screen.getByText('12 stitches')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Back loop only, BLO, Intermediate'),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Single crochet, sc, Beginner'),
    ).toBeOnTheScreen();
  });

  it('filters as the maker types and restores browse when the field is emptied', async () => {
    await render(tree(seeded));

    const field = screen.getByLabelText('Search stitches');
    // `.maestro/dictionary.yaml` taps this identifier: an accessible name is
    // not a Maestro `id`, so losing it would break the smoke flow silently.
    expect(screen.getByTestId('stitch-search-field')).toBe(field);
    await fireEvent.changeText(field, 'dc');

    expect(screen.getByText('2 matches')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Double crochet, dc, Beginner'),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Double crochet two together, dc2tog, Intermediate'),
    ).toBeOnTheScreen();
    // `hdc` contains `dc`; a substring search would surface it here.
    expect(
      screen.queryByLabelText('Half double crochet, hdc, Beginner'),
    ).not.toBeOnTheScreen();

    await fireEvent.changeText(field, '');

    expect(screen.getByText('12 stitches')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Half double crochet, hdc, Beginner'),
    ).toBeOnTheScreen();
  });

  it('treats an unmatched query as an empty result, not an error', async () => {
    await render(tree(seeded));

    await fireEvent.changeText(screen.getByLabelText('Search stitches'), 'zzz');

    expect(
      screen.getByRole('header', { name: 'No stitches match “zzz”' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('0 matches')).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));

    expect(screen.getByText('12 stitches')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Single crochet, sc, Beginner'),
    ).toBeOnTheScreen();
  });

  it('offers a retry instead of rows when a local read fails', async () => {
    const searchStitches = jest
      .fn<StitchSummary[], [string, Page?]>()
      .mockImplementationOnce(() => {
        throw new Error('simulated read failure');
      })
      .mockImplementation((query, page) =>
        seeded.stitches.searchStitches(query, page),
      );
    const repositories: Repositories = {
      ...seeded,
      stitches: { ...seeded.stitches, searchStitches },
    };

    await render(tree(repositories));

    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', {
        name: "We couldn't read your stitch dictionary",
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('stitch-results')).not.toBeOnTheScreen();
    expect(
      screen.queryByLabelText('Single crochet, sc, Beginner'),
    ).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(
      screen.getByLabelText('Single crochet, sc, Beginner'),
    ).toBeOnTheScreen();
  });

  it('appends one bounded page at a time and stops at the end of the catalog', async () => {
    const pool = Array.from({ length: 70 }, (_unused, index) =>
      fakeStitch(index),
    );
    const calls: Page[] = [];
    const repositories: Repositories = {
      ...seeded,
      stitches: {
        ...seeded.stitches,
        searchStitches: (_query, page) => {
          const resolved = page ?? { limit: DEFAULT_PAGE_LIMIT, offset: 0 };
          calls.push(resolved);

          return pool.slice(resolved.offset, resolved.offset + resolved.limit);
        },
      },
    };

    await render(tree(repositories));

    const list = screen.getByTestId('stitch-results');
    expect(list.props.data).toHaveLength(DEFAULT_PAGE_LIMIT);

    await fireEvent(list, 'endReached');

    const paged = screen.getByTestId('stitch-results').props
      .data as readonly StitchSummary[];
    expect(paged).toHaveLength(70);
    expect(new Set(paged.map((stitch) => stitch.id)).size).toBe(70);
    expect(calls).toStrictEqual([
      { limit: DEFAULT_PAGE_LIMIT, offset: 0 },
      { limit: DEFAULT_PAGE_LIMIT, offset: DEFAULT_PAGE_LIMIT },
    ]);

    // The short second page ends the catalog, so scrolling on must not re-read.
    await fireEvent(screen.getByTestId('stitch-results'), 'endReached');

    expect(calls).toHaveLength(2);
  });

  it('keeps the header, the search field, and rows usable at double text size', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);

    await render(tree(seeded));

    expect(screen.getByRole('header', { name: 'Stitches' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Search stitches')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Single crochet, sc, Beginner'),
    ).toBeOnTheScreen();
  });
});
