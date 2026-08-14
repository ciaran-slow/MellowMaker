import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import type { CounterOwner } from '@/data/contracts/counterRepository';
import { PatternViewerScreen } from '@/features/patterns/presentation/PatternViewerScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

// The isolated screen renders outside a navigator; router focus and navigation
// are stubbed so the initial mount read is the only load, mirroring
// PatternViewerScreen.test.tsx. The real repositories run against in-memory
// SQLite, so every counter assertion reads committed rows.
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

function tree(
  repositories: Repositories,
  patternId: string,
  mountKey = 'first',
) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <PatternViewerScreen key={mountKey} patternId={patternId} />
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

function primaryValue(repositories: Repositories, patternId: string): number {
  const owner: CounterOwner = { kind: 'pattern', id: patternId };

  return repositories.counters.getOrCreatePrimaryCounter(owner).value;
}

// Sequential, settled increments — used where a test only needs to reach a
// starting count, not reproduce a rapid double-tap.
async function incrementTimes(times: number): Promise<void> {
  const control = screen.getByLabelText('Increase Rows');
  for (let index = 0; index < times; index += 1) {
    await fireEvent.press(control);
  }
}

function counterCount(database: TestDatabase, patternId: string): number {
  return (
    database.connection.first<{ readonly total: number }>(
      'SELECT COUNT(*) AS total FROM counter WHERE pattern_id = ?',
      [patternId],
    )?.total ?? -1
  );
}

describe('PatternViewerScreen counter', () => {
  let database: TestDatabase;
  let repositories: Repositories;
  let patternId: string;

  beforeEach(() => {
    database = createTestDatabase();
    repositories = database.repositories;
    patternId = repositories.patterns.createPattern({
      title: 'Test Scarf',
      steps: ['Chain 20'],
    }).pattern.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('mounts one primary counter labelled Rows at zero', async () => {
    await render(tree(repositories, patternId));

    expect(await screen.findByLabelText('Rows: 0')).toBeOnTheScreen();
    expect(screen.getByLabelText('Increase Rows')).toBeOnTheScreen();
    // Mounting created exactly one counter for this pattern.
    expect(counterCount(database, patternId)).toBe(1);
  });

  it('counts exactly one per tap under a rapid double-tap', async () => {
    await render(tree(repositories, patternId));
    const increase = await screen.findByLabelText('Increase Rows');

    // Both taps land before a re-render settles, the way a rapid double-tap
    // does. A read-modify-write hook writing renderedValue + 1 from the stale 0
    // for both presses would land on 1; the serialized absolute-delta path
    // lands on exactly 2.
    await act(async () => {
      fireEvent.press(increase);
      fireEvent.press(increase);
    });

    expect(primaryValue(repositories, patternId)).toBe(2);
    expect(screen.getByLabelText('Rows: 2')).toBeOnTheScreen();
  });

  it('clamps a decrement at zero through the wired control', async () => {
    await render(tree(repositories, patternId));
    const decrease = await screen.findByLabelText('Decrease Rows');

    await fireEvent.press(decrease);

    // The SQL MAX(0, value - 1) clamp holds; a value - 1 hook would show -1.
    expect(primaryValue(repositories, patternId)).toBe(0);
    expect(screen.getByLabelText('Rows: 0')).toBeOnTheScreen();
  });

  it('keeps a nonzero count when the maker cancels the reset', async () => {
    await render(tree(repositories, patternId));
    await screen.findByLabelText('Increase Rows');
    await incrementTimes(3);
    expect(primaryValue(repositories, patternId)).toBe(3);

    await fireEvent.press(screen.getByLabelText('Reset Rows'));
    await fireEvent.press(screen.getByLabelText('Keep count'));

    expect(primaryValue(repositories, patternId)).toBe(3);
    expect(screen.getByLabelText('Rows: 3')).toBeOnTheScreen();
  });

  it('zeroes the count when the maker confirms the reset', async () => {
    await render(tree(repositories, patternId));
    await screen.findByLabelText('Increase Rows');
    await incrementTimes(3);

    await fireEvent.press(screen.getByLabelText('Reset Rows'));
    await fireEvent.press(screen.getByLabelText('Reset'));

    expect(primaryValue(repositories, patternId)).toBe(0);
    expect(screen.getByLabelText('Rows: 0')).toBeOnTheScreen();
  });

  it('never leaks a count from one pattern to another', async () => {
    const other = repositories.patterns.createPattern({
      title: 'Other Scarf',
      steps: [],
    }).pattern.id;

    await render(tree(repositories, patternId));
    const increase = await screen.findByLabelText('Increase Rows');
    await fireEvent.press(increase);
    await fireEvent.press(increase);

    expect(primaryValue(repositories, patternId)).toBe(2);
    // The other pattern's counter is untouched — read straight from SQLite.
    expect(primaryValue(repositories, other)).toBe(0);
  });

  it('survives a remount without resetting or duplicating the counter', async () => {
    await render(tree(repositories, patternId));
    await screen.findByLabelText('Increase Rows');
    await incrementTimes(4);
    expect(primaryValue(repositories, patternId)).toBe(4);

    // Remounting the screen (as returning to it does) re-reads SQLite.
    await screen.rerender(tree(repositories, patternId, 'return'));

    expect(await screen.findByLabelText('Rows: 4')).toBeOnTheScreen();
    expect(counterCount(database, patternId)).toBe(1);
  });

  it('persists a rename and announces it', async () => {
    await render(tree(repositories, patternId));
    await screen.findByLabelText('Increase Rows');
    await incrementTimes(4);

    await fireEvent.press(screen.getByLabelText('Rename counter'));
    await fireEvent.changeText(
      screen.getByTestId('counter-label-field'),
      'Stitches',
    );
    await fireEvent.press(screen.getByLabelText('Save name'));

    // The value display carries the new label and the same count.
    expect(screen.getByLabelText('Stitches: 4')).toBeOnTheScreen();
    // The polite region announced the rename.
    expect(screen.getByText('Counter renamed to Stitches')).toBeOnTheScreen();
    // A fresh read shows the persisted label.
    expect(
      repositories.counters.getOrCreatePrimaryCounter({
        kind: 'pattern',
        id: patternId,
      }).label,
    ).toBe('Stitches');
  });

  it('announces the new value through a polite live region after an increment', async () => {
    await render(tree(repositories, patternId));
    const increase = await screen.findByLabelText('Increase Rows');

    await fireEvent.press(increase);

    const region = screen.getByText('Rows: 1');
    expect(region.props.accessibilityLiveRegion).toBe('polite');
  });
});
