import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import type { PatternProgress } from '@/data/contracts/progressRepository';
import type { StepView } from '@/domain/patterns/patternProgress';
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

  // Issue #56 — the pattern viewer's chrome scrolls WITH the steps, the way the
  // guide working view's has since #43. Before this fix the title, progress row,
  // counter, and announcement were siblings ABOVE the list and the list carried
  // no `flex-1`: on the 390x844 fixture frame that chrome stood 639pt tall,
  // leaving 205pt of list — under 1.5 step rows — and it went off-screen
  // entirely on an iPhone SE at iOS accessibility text size AX1, and on this
  // frame at AX3. `flex-1` makes the list's height a function of the frame and
  // never of the header's content, so the failure mode is structurally
  // impossible rather than arithmetically unlikely.
  describe('one scroll surface (issue #56)', () => {
    it('renders the chrome inside the step list, leaving only the back control outside', async () => {
      await render(tree(repositories, patternId));
      await screen.findByRole('header', { name: 'Test Scarf' });

      const list = screen.getByTestId('pattern-steps');

      // Every piece of chrome is INSIDE the scroll surface…
      expect(
        within(list).getByRole('header', { name: 'Test Scarf' }),
      ).toBeOnTheScreen();
      expect(within(list).getByLabelText('Edit pattern')).toBeOnTheScreen();
      expect(within(list).getByText('0 of 3 steps done')).toBeOnTheScreen();
      expect(within(list).getByLabelText('Increase Rows')).toBeOnTheScreen();
      expect(
        within(list).getByLabelText('Mark step 1 complete'),
      ).toBeOnTheScreen();

      // …and the one bounded control that legitimately stays outside it is not.
      expect(within(list).queryByLabelText('Back to patterns')).toBeNull();
      expect(screen.getByLabelText('Back to patterns')).toBeOnTheScreen();
    });

    it('keeps the chrome in order: title, progress, counter, then the steps', async () => {
      await render(tree(repositories, patternId));
      await screen.findByRole('header', { name: 'Test Scarf' });

      const list = screen.getByTestId('pattern-steps');

      // Containment alone (the case above) cannot see order: a header whose
      // counter sits above the title, or one passed as `ListFooterComponent`,
      // satisfies every `within(list)` query. The order IS the recorded UX-06
      // trade-off — "+" is one short upward flick from the steps only because
      // the counter is the last thing before them — so it needs its own pin.
      // Walking the subtree depth-first reproduces render order, so a position
      // in that walk is a position on screen.
      const walked: unknown[] = [];
      const walk = (node: unknown): void => {
        if (typeof node !== 'object' || node === null) return;
        walked.push(node);
        for (const child of (node as { children?: unknown[] }).children ?? []) {
          walk(child);
        }
      };
      walk(list);

      const positionOf = (element: unknown): number => {
        const index = walked.indexOf(element);
        expect(index).toBeGreaterThanOrEqual(0);
        return index;
      };

      const title = within(list).getByRole('header', { name: 'Test Scarf' });
      const progress = within(list).getByText('0 of 3 steps done');
      const counter = within(list).getByLabelText('Increase Rows');
      const firstStep = within(list).getByLabelText('Mark step 1 complete');

      expect(positionOf(title)).toBeLessThan(positionOf(progress));
      expect(positionOf(progress)).toBeLessThan(positionOf(counter));
      expect(positionOf(counter)).toBeLessThan(positionOf(firstStep));
    });

    it('gives the list a height that cannot depend on its header', async () => {
      await render(tree(repositories, patternId));
      await screen.findByRole('header', { name: 'Test Scarf' });

      // NativeWind's stylesheet is mocked under Jest (jest.config maps `.css`
      // to `styleMock`), so `className` reaches the host element unresolved and
      // `props.style` is undefined — `toHaveStyle({ flexGrow: 1 })` would pass
      // vacuously either way, so the class list is the only observable form of
      // this decision in a test. `flex-1` is `flexBasis: 0` + `flexGrow: 1`:
      // the list claims whatever the back control leaves, at any text size and
      // on any device, so a tall header can never starve it again.
      const classes = String(
        screen.getByTestId('pattern-steps').props.className,
      ).split(/\s+/);
      expect(classes).toContain('flex-1');
    });

    it('never remounts the header when a step or the counter changes', async () => {
      await render(tree(repositories, patternId));
      await screen.findByRole('header', { name: 'Test Scarf' });

      // An open rename draft is the user-observable falsifier: an inline
      // `ListHeaderComponent={() => …}` is a NEW component type on every
      // render, so React would unmount and remount the header subtree, resetting
      // `CraftCounter`'s `editingLabel` to false and destroying the half-typed
      // name (and the keyboard focus with it) on every tap below.
      await fireEvent.press(screen.getByLabelText('Rename counter'));
      await fireEvent.changeText(
        screen.getByTestId('counter-label-field'),
        'Rounds',
      );

      await fireEvent.press(screen.getByLabelText('Mark step 1 complete'));
      await fireEvent.press(screen.getByLabelText('Increase Rows'));

      // The draft survived both re-renders, unsaved and still open…
      expect(screen.getByTestId('counter-label-field').props.value).toBe(
        'Rounds',
      );
      // …and both taps genuinely landed, so this cannot pass by doing nothing.
      expect(screen.getByLabelText('Rows: 1')).toBeOnTheScreen();
      expect(
        repositories.progress.getProgress(patternId).completedStepIds,
      ).toContain(stepIds[0]);
    });

    it('renders the chrome above the empty state when the pattern has no steps', async () => {
      const empty = repositories.patterns.createPattern({
        title: 'Empty Scarf',
        steps: [],
      });

      await render(tree(repositories, empty.pattern.id, 'empty'));
      await screen.findByRole('header', { name: 'Empty Scarf' });

      const list = screen.getByTestId('pattern-steps');
      expect(
        within(list).getByRole('header', { name: 'Empty Scarf' }),
      ).toBeOnTheScreen();
      expect(within(list).getByLabelText('Increase Rows')).toBeOnTheScreen();
      // "Edit pattern" is deliberately not asserted here: the empty component
      // renders a second control of that name, so it is ambiguous in this state.
      expect(
        within(list).getByRole('header', { name: 'No steps yet' }),
      ).toBeOnTheScreen();
    });

    it('carries the list props the scroll decisions depend on', async () => {
      await render(tree(repositories, patternId));
      await screen.findByRole('header', { name: 'Test Scarf' });

      const list = screen.getByTestId('pattern-steps');

      // Structural guards: Jest has no layout engine and cannot simulate a
      // keyboard-swallowed tap, so these pin the decisions; the behaviour behind
      // them is deferred to the device (056-issue-56.md).

      // Without this the counter's rename would need two taps: the first would
      // only dismiss the keyboard rather than press "Save name".
      expect(list.props.keyboardShouldPersistTaps).toBe('handled');

      // `VirtualizedList` takes `getItemLayout`'s offsets verbatim and tracks
      // the header's measured height separately, never adding it — so the old
      // `ESTIMATED_STEP_HEIGHT` `initialScrollIndex` would now scroll to a
      // header-unaware offset: on step 3 that is 264pt, a point INSIDE the
      // counter card, hiding the title without reaching the step.
      expect(list.props.getItemLayout).toBeUndefined();
      expect(list.props.initialScrollIndex).toBeUndefined();
    });

    it('still restores the current step far down a long pattern, without the mount-time jump', async () => {
      // The falsifier for the removal: what FR-PV-05 actually promises is the
      // DURABLE position, held in SQLite and rendered as the selected current
      // step — not a scroll offset, which this app has never persisted. Index 19
      // is well past `initialNumToRender`'s default of 10, so this is exactly
      // the case a 3-step fixture can never reach. What IS given up is stated
      // out loud: the row is present and marked current, but the list no longer
      // scrolls to it on open.
      const long = repositories.patterns.createPattern({
        title: 'Long Blanket',
        steps: Array.from({ length: 24 }, (_, index) => `Row ${index + 1}`),
      });
      const longId = long.pattern.id;
      const longStepIds = long.steps.map((step) => step.id);
      repositories.progress.setActiveStep(longId, longStepIds[19] ?? null);

      await render(tree(repositories, longId, 'long'));
      await screen.findByRole('header', { name: 'Long Blanket' });

      const assertCurrentIsStepTwenty = (): void => {
        expect(repositories.progress.getProgress(longId).activeStepId).toBe(
          longStepIds[19],
        );
        const steps = screen.getByTestId('pattern-steps').props
          .data as readonly StepView[];
        expect(steps[19]?.status).toBe('current');
        expect(
          steps.filter((step) => step.status === 'current'),
        ).toHaveLength(1);
      };

      assertCurrentIsStepTwenty();

      // Remounting the screen (as returning to it does) re-reads SQLite and
      // restores the same position from scratch.
      await screen.rerender(tree(repositories, longId, 'long-return'));
      await screen.findByRole('header', { name: 'Long Blanket' });

      assertCurrentIsStepTwenty();
    });
  });
});
