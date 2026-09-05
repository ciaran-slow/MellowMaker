import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { AccessibilityInfo, FlatList, Platform } from 'react-native';
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

    it('keeps the counter read-failure alert inside the step list', async () => {
      // The header took ownership of the counter's failed/retry branch in #56,
      // and nothing on this screen rendered that branch at all — so nothing
      // proved the alert lands inside the scroll surface with the rest of the
      // chrome. Only the counter read fails here; the pattern read succeeds, so
      // the steps are present and a single bad counter read must not black them
      // out (the screen-local failure rule, architecture §10).
      const failing: Repositories = {
        ...repositories,
        counters: {
          ...repositories.counters,
          getOrCreatePrimaryCounter: () => {
            throw new Error('simulated counter read failure');
          },
        },
      };

      await render(tree(failing, patternId, 'counter-failed'));
      await screen.findByRole('header', {
        name: "We couldn't load this counter",
      });

      const list = screen.getByTestId('pattern-steps');
      expect(
        within(list).getByRole('header', {
          name: "We couldn't load this counter",
        }),
      ).toBeOnTheScreen();
      expect(
        within(list).getByLabelText('Try again to load the counter'),
      ).toBeOnTheScreen();
      // The steps and the rest of the chrome are unaffected.
      expect(
        within(list).getByRole('header', { name: 'Test Scarf' }),
      ).toBeOnTheScreen();
      expect(
        within(list).getByLabelText('Mark step 1 complete'),
      ).toBeOnTheScreen();
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

  // Issue #63 — the viewer opens AT the maker's current step again. #56 removed
  // the `initialScrollIndex`/`getItemLayout` jump because `VirtualizedList`
  // takes those offsets verbatim and tracks the header's height separately, so
  // a maker on step 3 landed at 264pt, inside the counter card. The replacement
  // scrolls AFTER layout instead: a cell's measured offset is
  // content-container-relative and so already contains the header cell.
  //
  // What these cases can and cannot prove (AC5): Jest has no layout engine, so
  // `getHighestMeasuredCellIndex()` is 0 here and every attempt at an index
  // above 0 takes `VirtualizedList`'s failure branch. They therefore pin the
  // INTENT — the right index, at the right moment, exactly the right number of
  // times, and never at the wrong moments — never the resulting pixel offset.
  // The offset is guaranteed by construction (measured cells only) and observed
  // by step 3 of the owner's device script in
  // `docs/runbooks/deferred-smokes/063-issue-63.md`.
  //
  // `jest.spyOn(FlatList.prototype, 'scrollToIndex')` records the call and CALLS
  // THROUGH, so the real `VirtualizedList` branch — including its
  // `invariant(!!onScrollToIndexFailed, …)` — runs under the spy and a missing
  // handler would throw rather than pass quietly.
  //
  // The neighbouring #56 case is titled "…without the mount-time jump" (line
  // 539). Every assertion in it is still true — it only ever pinned the DURABLE
  // position — but its name now describes a world this block ends. AC4 freezes
  // that block byte-identical, so the rename is left to the retro (plan D5).
  describe('opens at the current step (issue #63)', () => {
    const SCROLL_TO_CURRENT = (index: number) => ({
      animated: false,
      index,
      viewPosition: 0,
    });

    /**
     * The 24-step fixture. `completeThrough` completes steps 1..n in order, so
     * the current step is the next one WITHOUT relying on `activeStepId` —
     * which matters wherever a completion tap has to advance it, because
     * `nextIncompleteStepId` walks from the start of the list.
     */
    const createLongPattern = (options?: {
      readonly activeStepIndex?: number;
      readonly completeThrough?: number;
      readonly completeAll?: boolean;
    }): { readonly id: string; readonly stepIds: readonly string[] } => {
      const long = repositories.patterns.createPattern({
        title: 'Long Blanket',
        steps: Array.from({ length: 24 }, (_, index) => `Row ${index + 1}`),
      });
      const stepIds = long.steps.map((step) => step.id);

      const completeCount = options?.completeAll
        ? stepIds.length
        : (options?.completeThrough ?? 0);
      for (const stepId of stepIds.slice(0, completeCount)) {
        repositories.progress.setStepCompleted(stepId, true);
      }
      if (options?.activeStepIndex !== undefined) {
        repositories.progress.setActiveStep(
          long.pattern.id,
          stepIds[options.activeStepIndex] ?? null,
        );
      }

      return { id: long.pattern.id, stepIds };
    };

    const openLongBlanket = async (
      id: string,
      mountKey: string,
    ): Promise<ReturnType<typeof screen.getByTestId>> => {
      await render(tree(repositories, id, mountKey));
      await screen.findByRole('header', { name: 'Long Blanket' });

      return screen.getByTestId('pattern-steps');
    };

    const fireContentSizeChange = async (
      list: ReturnType<typeof screen.getByTestId>,
    ): Promise<void> => {
      await fireEvent(list, 'contentSizeChange', 390, 3000);
    };

    it('scrolls to the current step on the first content-size change', async () => {
      const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex');
      const long = createLongPattern({ activeStepIndex: 19 });

      const list = await openLongBlanket(long.id, 'restore-first');

      // Rendering alone must not scroll: nothing has been laid out yet, so any
      // offset at this point could only be an estimate — the class of jump #56
      // removed.
      expect(scrollToIndex).not.toHaveBeenCalled();

      await fireContentSizeChange(list);

      expect(scrollToIndex).toHaveBeenCalledWith(SCROLL_TO_CURRENT(19));
    });

    it('retries a failed attempt on the next content-size change', async () => {
      const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex');
      const long = createLongPattern({ activeStepIndex: 19 });

      const list = await openLongBlanket(long.id, 'restore-retry');

      // Undefined before this change, and `VirtualizedList` asserts it exists
      // whenever there is no `getItemLayout` — so without it the very first
      // attempt throws instead of failing softly.
      expect(typeof list.props.onScrollToIndexFailed).toBe('function');

      await fireContentSizeChange(list);
      await fireContentSizeChange(list);

      // Index 19 is unmeasured here, so both attempts fail: an implementation
      // that settled optimistically on the first attempt would leave the maker
      // at the top forever, having "restored" nothing.
      expect(scrollToIndex).toHaveBeenCalledTimes(2);
      expect(
        scrollToIndex.mock.calls.map(([options]) => options.index),
      ).toEqual([19, 19]);
    });

    it('gives up after five attempts instead of retrying for the life of the list', async () => {
      const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex');
      const long = createLongPattern({ activeStepIndex: 19 });

      const list = await openLongBlanket(long.id, 'restore-capped');

      // `onContentSizeChange` fires for the whole life of the list, including
      // on a completion that changes a row's height. Unbounded, an attempt that
      // finally succeeded long after open would yank a maker who had scrolled
      // elsewhere. The literals here are deliberate — `MAX_RESTORE_ATTEMPTS` is
      // NOT imported, so this boundary is not derived from the constant it pins.
      for (let fire = 0; fire < 6; fire += 1) {
        await fireContentSizeChange(list);
      }
      expect(scrollToIndex).toHaveBeenCalledTimes(5);

      // The seventh fire, well after the startup window, is likewise ignored.
      await fireContentSizeChange(list);
      expect(scrollToIndex).toHaveBeenCalledTimes(5);
    });

    // Added by the build stage's mutation self-check, not in the plan's list of
    // seven. Deleting the hook's `if (settledRef.current) return;` left every
    // planned case green: the cap covers the count, the `<= 0` guard is
    // idempotent, and a throw planted on that guard showed only the cap case and
    // the first-row case ever reach it. The one contract `settledRef` decides
    // alone — a NON-FAILING attempt settles the restore for this mount — was
    // named by no test, because with the spy calling through every index above 0
    // is unmeasured in Jest and the landing branch is unreachable. On device
    // that is the difference between one snap and a list that keeps re-snapping
    // for the rest of the session.
    it('settles for the mount as soon as an attempt does not fail', async () => {
      // A `mockImplementation` no-op stands in for the landing: `scrollToIndex`
      // records the call and does NOT invoke `onScrollToIndexFailed`, which is
      // exactly what a measured cell looks like to this hook.
      const scrollToIndex = jest
        .spyOn(FlatList.prototype, 'scrollToIndex')
        .mockImplementation(() => {});
      const long = createLongPattern({ activeStepIndex: 19 });

      const list = await openLongBlanket(long.id, 'restore-settles');

      await fireContentSizeChange(list);
      expect(scrollToIndex).toHaveBeenCalledTimes(1);

      // `onContentSizeChange` fires for the whole life of the list — a row whose
      // height changes on completion fires it again. Once the maker has landed,
      // none of those may move the list, and the cap cannot be what stops them:
      // only two of five attempts have been spent.
      await fireContentSizeChange(list);
      await fireContentSizeChange(list);
      expect(scrollToIndex).toHaveBeenCalledTimes(1);
    });

    it('does not scroll when the current step is already the first row', async () => {
      const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex');
      const long = createLongPattern();

      const list = await openLongBlanket(long.id, 'restore-at-top');

      const steps = list.props.data as readonly StepView[];
      expect(steps[0]?.status).toBe('current');

      await fireContentSizeChange(list);
      await fireContentSizeChange(list);

      // Index 0 is NOT an unmeasured index, so a missing guard would not fail
      // softly: it would really scroll to offset 0 on every content-size change
      // during the initial fill, snapping a maker who had flicked ahead in a
      // fresh pattern straight back to the top.
      expect(scrollToIndex).not.toHaveBeenCalled();
    });

    it('does not scroll when the pattern has no current step at all', async () => {
      const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex');

      // (a) A pattern with no steps. Without the guard `findIndex` returns -1
      // and `scrollToIndex` trips `invariant(getItemCount(data) >= 1, …)`.
      const empty = repositories.patterns.createPattern({
        title: 'Empty Blanket',
        steps: [],
      });
      await render(tree(repositories, empty.pattern.id, 'restore-empty'));
      await screen.findByRole('header', { name: 'Empty Blanket' });

      await fireContentSizeChange(screen.getByTestId('pattern-steps'));
      expect(scrollToIndex).not.toHaveBeenCalled();

      // (b) A pattern the maker has finished. Same -1, and without the guard
      // `invariant(index >= 0, …)` throws — the screen crashes on a state every
      // maker reaches by finishing a project.
      const done = createLongPattern({ completeAll: true });
      await screen.rerender(tree(repositories, done.id, 'restore-complete'));
      await screen.findByRole('header', { name: 'Long Blanket' });

      const list = screen.getByTestId('pattern-steps');
      const steps = list.props.data as readonly StepView[];
      expect(steps.filter((step) => step.status === 'current')).toHaveLength(0);

      await fireContentSizeChange(list);
      expect(scrollToIndex).not.toHaveBeenCalled();
    });

    it('never re-scrolls on a completion or a counter tap, but a fresh open restores again', async () => {
      const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex');

      // Deviation from the plan's fixture, forced by the harness: RNTL renders
      // `initialNumToRender` (10) rows and has no layout engine to advance the
      // window, so "Mark step 20 complete" is never in the tree and the plan's
      // index 19/20 cannot be tapped. Steps 1-9 complete makes step 10 (index 9)
      // the current step — still greater than 0, still unmeasured, and still a
      // step whose completion advances the current step by one, so both wrong
      // implementations this case exists to separate are still separated.
      const long = createLongPattern({ completeThrough: 9 });
      const list = await openLongBlanket(long.id, 'restore-tap');

      await fireContentSizeChange(list);
      expect(scrollToIndex).toHaveBeenCalledTimes(1);
      expect(scrollToIndex).toHaveBeenLastCalledWith(SCROLL_TO_CURRENT(9));

      // The maker has arrived and is reading. Completing the current step moves
      // it to index 10 — a `useEffect(…, [currentStepId])` restore would snap
      // the list away from what they are reading right here — and the counter
      // tap re-renders the whole screen, which an UNKEYED effect would answer
      // the same way. Neither may move the list.
      await fireEvent.press(screen.getByLabelText('Mark step 10 complete'));
      await fireEvent.press(screen.getByLabelText('Increase Rows'));

      expect(scrollToIndex).toHaveBeenCalledTimes(1);
      // Both taps genuinely landed, so this cannot pass by doing nothing.
      expect(screen.getByLabelText('Rows: 1')).toBeOnTheScreen();
      expect(
        repositories.progress.getProgress(long.id).completedStepIds,
      ).toContain(long.stepIds[9]);

      // …and the suppression is per MOUNT, not a global latch and not a stale
      // index: leaving and reopening restores again, to the step the maker has
      // actually reached.
      const reopened = await openLongBlanket(long.id, 'restore-reopen');
      await fireContentSizeChange(reopened);

      expect(scrollToIndex).toHaveBeenCalledTimes(2);
      expect(scrollToIndex).toHaveBeenLastCalledWith(SCROLL_TO_CURRENT(10));
    });

    it('never turns the scroll-to-index failure payload into an offset', async () => {
      // The only falsifiable form this contract has here. The failure payload
      // in this harness reads `{ averageItemLength: 0, … }`, so an
      // offset-scroll driven by it is behaviourally IDENTICAL to not scrolling
      // and no runtime assertion could tell the two apart. The source can. Same
      // idiom as `accessibilityContrast.test.ts`'s walk.
      const source = readFileSync(
        path.join(
          __dirname,
          '..',
          'src/features/patterns/presentation/usePatternPositionRestore.ts',
        ),
        'utf8',
      );

      // The payload's two numeric fields, and the API that would turn either of
      // them into a scroll. `averageItemLength × index` is header-unaware — it
      // is precisely the arithmetic #56 removed, and here it is literally 0.
      for (const forbidden of [
        'averageItemLength',
        'highestMeasuredFrameIndex',
        'scrollToOffset',
      ]) {
        expect(source).not.toContain(forbidden);
      }

      // The handler really is parameterless, so the payload is not even in
      // scope to be used.
      expect(source).toContain('onScrollToIndexFailed = useCallback((): void');
    });
  });
});
