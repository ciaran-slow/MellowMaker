import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import { GuideWorkingViewScreen } from '@/features/guides/presentation/GuideWorkingViewScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

// The isolated screen renders outside a navigator, so router focus and
// navigation are stubbed; the navigation suite exercises the real router.
// `useFocusEffect` is a no-op so the initial mount read is the only load.
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

function tree(repositories: Repositories, guideId: string, mountKey = 'first') {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <GuideWorkingViewScreen key={mountKey} guideId={guideId} />
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

function seedGuide(
  repositories: Repositories,
  instructions: readonly string[],
  videoId = 'dQw4w9WgXcQ',
): { guideId: string; stepIds: string[] } {
  const saved = repositories.guides.saveImportedGuide({
    guide: {
      videoId,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: 'Amigurumi Basics',
    },
    steps: instructions.map((instruction) => ({ instruction, origin: 'user' })),
  });

  return {
    guideId: saved.guide.id,
    stepIds: saved.steps.map((step) => step.id),
  };
}

function completedIds(repositories: Repositories, guideId: string): string[] {
  return (repositories.guides.getGuideWithSteps(guideId)?.steps ?? [])
    .filter((step) => step.completedAt !== undefined)
    .map((step) => step.id);
}

describe('GuideWorkingViewScreen', () => {
  let database: TestDatabase;
  let repositories: Repositories;

  beforeEach(() => {
    database = createTestDatabase();
    repositories = database.repositories;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('shows the video-unavailable placeholder without disabling the saved steps', async () => {
    const { guideId, stepIds } = seedGuide(repositories, ['Make a magic ring']);
    await render(tree(repositories, guideId));

    await screen.findByRole('header', { name: 'Amigurumi Basics' });

    // The placeholder message and the step list are BOTH present: the list is
    // never gated behind the placeholder.
    expect(
      screen.getByRole('header', { name: 'Video plays in the YouTube app' }),
    ).toBeOnTheScreen();
    const complete = screen.getByLabelText('Mark step 1 complete');
    expect(complete).toBeOnTheScreen();

    // And the list is interactive: pressing the checkbox completes the step.
    await fireEvent.press(complete);
    expect(completedIds(repositories, guideId)).toStrictEqual([stepIds[0]]);
    expect(screen.getByText('Completed')).toBeOnTheScreen();
  });

  it('renders a timestamp badge for a step that has one', async () => {
    const saved = repositories.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Amigurumi Basics',
      },
      steps: [{ instruction: 'Chain 6', origin: 'user', videoOffsetMs: 42000 }],
    });

    await render(tree(repositories, saved.guide.id));
    await screen.findByRole('header', { name: 'Amigurumi Basics' });

    expect(screen.getByText('0:42')).toBeOnTheScreen();
    expect(screen.getByLabelText('Video timestamp 0:42')).toBeOnTheScreen();
  });

  it('keeps current at the first incomplete step when a later step is completed out of order', async () => {
    const { guideId, stepIds } = seedGuide(repositories, ['A', 'B', 'C']);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Amigurumi Basics' });

    // Complete step 1: current advances to step 2 (first incomplete).
    await fireEvent.press(screen.getByLabelText('Mark step 1 complete'));
    expect(
      screen.getByLabelText('Step 2 of 3, current step: B').props
        .accessibilityState.selected,
    ).toBe(true);

    // Complete step 3 out of order while step 2 is still incomplete.
    await fireEvent.press(screen.getByLabelText('Mark step 3 complete'));

    // Both completions are recorded.
    expect(completedIds(repositories, guideId).sort()).toStrictEqual(
      [stepIds[0], stepIds[2]].sort(),
    );
    // Current is PINNED to step 2 (first incomplete) — not step 3, not undefined.
    expect(
      screen.getByLabelText('Step 2 of 3, current step: B').props
        .accessibilityState.selected,
    ).toBe(true);
  });

  it('mounts a guide counter labelled Rows at zero and counts one per tap', async () => {
    const { guideId } = seedGuide(repositories, ['A']);
    await render(tree(repositories, guideId));
    const increase = await screen.findByLabelText('Increase Rows');

    await act(async () => {
      fireEvent.press(increase);
      fireEvent.press(increase);
    });

    expect(
      repositories.counters.getOrCreatePrimaryCounter({
        kind: 'guide',
        id: guideId,
      }).value,
    ).toBe(2);
    expect(screen.getByLabelText('Rows: 2')).toBeOnTheScreen();
  });

  it('isolates one guide counter from another guide', async () => {
    const { guideId: g1 } = seedGuide(repositories, ['A'], 'aaaaaaaaaaa');
    const { guideId: g2 } = seedGuide(repositories, ['B'], 'bbbbbbbbbbb');

    await render(tree(repositories, g1));
    const increase = await screen.findByLabelText('Increase Rows');
    await fireEvent.press(increase);
    await fireEvent.press(increase);

    // Mount the second guide's working view: its counter reads zero. A shared
    // owner key (ignoring the guide id) would leak the count of 2 into g2.
    await screen.rerender(tree(repositories, g2, 'second'));
    expect(await screen.findByLabelText('Rows: 0')).toBeOnTheScreen();
    expect(
      repositories.counters.getOrCreatePrimaryCounter({ kind: 'guide', id: g1 })
        .value,
    ).toBe(2);
  });

  it('keeps the step list usable when the counter read fails', async () => {
    const { guideId } = seedGuide(repositories, ['A']);
    const getOrCreatePrimaryCounter = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('simulated counter read failure');
      })
      .mockImplementation((owner) =>
        repositories.counters.getOrCreatePrimaryCounter(owner),
      );
    const failing: Repositories = {
      ...repositories,
      counters: { ...repositories.counters, getOrCreatePrimaryCounter },
    };

    await render(tree(failing, guideId));
    await screen.findByRole('header', { name: 'Amigurumi Basics' });

    // The counter shows its own screen-local failure, but the steps stay usable.
    expect(
      screen.getByRole('header', { name: "We couldn't load this counter" }),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Mark step 1 complete')).toBeOnTheScreen();
  });

  it('tells the maker a stale guide id is no longer here', async () => {
    await render(tree(repositories, 'not-a-guide'));

    expect(
      await screen.findByRole('header', {
        name: 'This guide is no longer here',
      }),
    ).toBeOnTheScreen();
  });

  it('offers a retry when the guide read fails, and recovers', async () => {
    const { guideId } = seedGuide(repositories, ['A']);
    const getGuideWithSteps = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('simulated read failure');
      })
      .mockImplementation((id) => repositories.guides.getGuideWithSteps(id));
    const failing: Repositories = {
      ...repositories,
      guides: { ...repositories.guides, getGuideWithSteps },
    };

    await render(tree(failing, guideId));

    expect(
      await screen.findByRole('header', { name: "We couldn't open this guide" }),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(
      screen.getByRole('header', { name: 'Amigurumi Basics' }),
    ).toBeOnTheScreen();
  });
});
