import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import type { PatternProgress } from '@/data/contracts/progressRepository';
import { PatternViewerScreen } from '@/features/patterns/presentation/PatternViewerScreen';
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

function tree(repositories: Repositories, patternId: string, mountKey = 'first') {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <PatternViewerScreen key={mountKey} patternId={patternId} />
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

describe('PatternViewerScreen', () => {
  let database: TestDatabase;
  let repositories: Repositories;
  let patternId: string;
  let stepIds: string[];

  beforeEach(() => {
    database = createTestDatabase();
    repositories = database.repositories;
    const created = repositories.patterns.createPattern({
      title: 'Test Scarf',
      steps: ['Chain 20', 'Single crochet across', 'Fasten off'],
    });
    patternId = created.pattern.id;
    stepIds = created.steps.map((step) => step.id);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('renders steps in order with the first step current and the rest to do', async () => {
    await render(tree(repositories, patternId));

    expect(
      await screen.findByRole('header', { name: 'Test Scarf' }),
    ).toBeOnTheScreen();

    // Status is stated in words, never colour alone.
    expect(screen.getByText('Current step')).toBeOnTheScreen();
    expect(screen.getAllByText('To do')).toHaveLength(2);

    // Every completion control is an unchecked checkbox.
    expect(screen.getAllByRole('checkbox', { checked: false })).toHaveLength(3);

    // The current step exposes `selected` and says so in its label.
    const current = screen.getByLabelText(
      'Step 1 of 3, current step: Chain 20',
    );
    expect(current.props.accessibilityState.selected).toBe(true);

    expect(screen.getByText('0 of 3 steps done')).toBeOnTheScreen();
  });

  it('completes the current step: persists it, advances, and announces', async () => {
    await render(tree(repositories, patternId));
    await screen.findByRole('header', { name: 'Test Scarf' });

    await fireEvent.press(
      screen.getByLabelText('Mark step 1 complete'),
    );

    // Assert against SQLite, not component state.
    expect(
      repositories.progress.getProgress(patternId).completedStepIds,
    ).toStrictEqual([stepIds[0]]);

    expect(
      screen.getByLabelText('Step 1 of 3, completed: Chain 20'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { checked: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('Reopen step 1')).toBeOnTheScreen();

    // The current step advanced to step 2.
    const nextCurrent = screen.getByLabelText(
      'Step 2 of 3, current step: Single crochet across',
    );
    expect(nextCurrent.props.accessibilityState.selected).toBe(true);
    expect(repositories.progress.getProgress(patternId).activeStepId).toBe(
      stepIds[1],
    );

    expect(
      screen.getByText('Step 1 completed. Now on step 2.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('1 of 3 steps done')).toBeOnTheScreen();
  });

  it('reopens a completed step, clearing its completion', async () => {
    await render(tree(repositories, patternId));
    await screen.findByRole('header', { name: 'Test Scarf' });

    await fireEvent.press(screen.getByLabelText('Mark step 1 complete'));
    expect(
      repositories.progress.getProgress(patternId).completedStepIds,
    ).toStrictEqual([stepIds[0]]);

    await fireEvent.press(screen.getByLabelText('Reopen step 1'));

    expect(
      repositories.progress.getProgress(patternId).completedStepIds,
    ).not.toContain(stepIds[0]);
    // The step's control is back to "Mark complete" and its box is unchecked.
    expect(screen.getByLabelText('Mark step 1 complete')).toBeOnTheScreen();
  });

  it('does not double-record a step tapped twice in rapid succession', async () => {
    await render(tree(repositories, patternId));
    await screen.findByRole('header', { name: 'Test Scarf' });

    const control = screen.getByLabelText('Mark step 2 complete');
    // Both taps land on the same "Mark complete" control before a re-render
    // settles, the way a rapid double-tap does; batching them in one act keeps
    // the two synchronous presses from leaking an unflushed update.
    await act(async () => {
      fireEvent.press(control);
      fireEvent.press(control);
    });

    expect(
      repositories.progress.getProgress(patternId).completedStepIds,
    ).toStrictEqual([stepIds[1]]);
  });

  it('ends reopened when a step is completed then reopened', async () => {
    await render(tree(repositories, patternId));
    await screen.findByRole('header', { name: 'Test Scarf' });

    await fireEvent.press(screen.getByLabelText('Mark step 2 complete'));
    await fireEvent.press(screen.getByLabelText('Reopen step 2'));

    expect(
      repositories.progress.getProgress(patternId).completedStepIds,
    ).not.toContain(stepIds[1]);
  });

  it('restores completion and the active position after leaving and returning', async () => {
    repositories.progress.setStepCompleted(stepIds[0] ?? '', true);
    repositories.progress.setActiveStep(patternId, stepIds[2] ?? null);

    await render(tree(repositories, patternId));
    await screen.findByRole('header', { name: 'Test Scarf' });

    // The restored current step (step 3) is rendered, selected, and labelled as
    // the current step; the completed step's persistence is read from SQLite
    // (it is virtualized above the restored scroll position).
    expect(
      screen.getByLabelText('Step 3 of 3, current step: Fasten off').props
        .accessibilityState.selected,
    ).toBe(true);
    expect(
      repositories.progress.getProgress(patternId).completedStepIds,
    ).toStrictEqual([stepIds[0]]);

    // Remounting the screen (as returning to it does) re-reads SQLite and
    // restores the same position from scratch.
    await screen.rerender(tree(repositories, patternId, 'return'));
    await screen.findByRole('header', { name: 'Test Scarf' });

    expect(
      screen.getByLabelText('Step 3 of 3, current step: Fasten off').props
        .accessibilityState.selected,
    ).toBe(true);
    expect(
      repositories.progress.getProgress(patternId).activeStepId,
    ).toBe(stepIds[2]);
  });

  it('moves the working position without completing when Work on step is pressed', async () => {
    await render(tree(repositories, patternId));
    await screen.findByRole('header', { name: 'Test Scarf' });

    await fireEvent.press(screen.getByLabelText('Work on step 3'));

    expect(repositories.progress.getProgress(patternId).activeStepId).toBe(
      stepIds[2],
    );
    expect(
      repositories.progress.getProgress(patternId).completedStepIds,
    ).toStrictEqual([]);
    expect(
      screen.getByLabelText('Step 3 of 3, current step: Fasten off').props
        .accessibilityState.selected,
    ).toBe(true);
  });

  it('completing an earlier, non-current step does not move the active position', async () => {
    // Mounting with step 1 current keeps every row rendered; `initialScrollIndex`
    // only applies at mount, so selecting step 3 afterwards does not virtualize
    // the earlier rows away and step 1's control stays pressable.
    await render(tree(repositories, patternId));
    await screen.findByRole('header', { name: 'Test Scarf' });

    // Park the maker on step 3.
    await fireEvent.press(screen.getByLabelText('Work on step 3'));
    expect(repositories.progress.getProgress(patternId).activeStepId).toBe(
      stepIds[2],
    );

    // Complete step 1 — earlier than, and not, the current step.
    await fireEvent.press(screen.getByLabelText('Mark step 1 complete'));

    // (a) The completion is recorded.
    expect(
      repositories.progress.getProgress(patternId).completedStepIds,
    ).toContain(stepIds[0]);
    // (b) The active/current position is UNCHANGED — still step 3. The expected
    // id is pinned to step 3, not derived from the code: removing the
    // `if (stepId === currentBefore)` guard in `completeStep` would auto-advance
    // the pointer to step 2 and fail this assertion.
    expect(repositories.progress.getProgress(patternId).activeStepId).toBe(
      stepIds[2],
    );
    expect(
      screen.getByLabelText('Step 3 of 3, current step: Fasten off').props
        .accessibilityState.selected,
    ).toBe(true);
    // Step 1 now reads as completed, not current.
    expect(
      screen.getByLabelText('Step 1 of 3, completed: Chain 20'),
    ).toBeOnTheScreen();
  });

  it('tells the maker a stale pattern id is no longer here', async () => {
    await render(tree(repositories, 'not-a-pattern'));

    expect(
      await screen.findByRole('header', {
        name: 'This pattern is no longer here',
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('offers a retry when the local progress read fails, and recovers', async () => {
    const getProgress = jest
      .fn<PatternProgress, [string]>()
      .mockImplementationOnce(() => {
        throw new Error('simulated read failure');
      })
      .mockImplementation((id) => repositories.progress.getProgress(id));
    const failing: Repositories = {
      ...repositories,
      progress: { ...repositories.progress, getProgress },
    };

    await render(tree(failing, patternId));

    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: "We couldn't read this pattern" }),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'Test Scarf' }),
    ).toBeOnTheScreen();
  });

  it('speaks step completion and the progress summary on iOS (A11Y-07)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();
    await render(tree(repositories, patternId));
    await screen.findByRole('header', { name: 'Test Scarf' });
    announce.mockClear();

    await fireEvent.press(screen.getByLabelText('Mark step 1 complete'));

    const spoken = announce.mock.calls.map(([text]) => text);
    expect(spoken).toContain('Step 1 completed. Now on step 2.');
    expect(spoken).toContain('1 of 3 steps done');
  });

  it('speaks the same read-failure title the alert renders, on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();
    const failing: Repositories = {
      ...repositories,
      progress: {
        ...repositories.progress,
        getProgress: jest.fn<PatternProgress, [string]>(() => {
          throw new Error('simulated read failure');
        }),
      },
    };

    await render(tree(failing, patternId));
    await screen.findByRole('alert');

    expect(announce).toHaveBeenCalledWith("We couldn't read this pattern");
  });
});
