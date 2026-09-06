import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  AccessibilityInfo,
  FlatList,
  Platform,
  VirtualizedList,
} from 'react-native';
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

    /** Just past `VirtualizedList`'s 50ms `updateCellsBatchingPeriod`. */
    const FILL_BATCH_PERIOD_MS = 80;
    /** The header cell's height in the fixtures below — see `measureCells`. */
    const HEADER_HEIGHT = 200;
    const ROW_HEIGHT = 80;

    const flushDeferredAttempt = async (waitMs: number): Promise<void> => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      });
    };

    const fireContentSizeChange = async (
      list: ReturnType<typeof screen.getByTestId>,
    ): Promise<void> => {
      await fireEvent(list, 'contentSizeChange', 390, 3000);
      await flushDeferredAttempt(0);
    };

    /**
     * Every rendered cell's `onLayout`, in index order, with a content-container
     * relative `y` that already contains the header — which is what a real cell
     * layout carries (`ListMetricsAggregator.flowRelativeOffset` records
     * `layout.y` as-is, and the content container's children are the header cell
     * then the rows). Feeding a non-zero `HEADER_HEIGHT` is the point: the offset
     * `scrollToOffset` is then asked for can only be header-aware.
     *
     * Cells are found by the signature `VirtualizedListCellRenderer` gives them —
     * a `View` carrying both `onLayout` and `onFocusCapture` — which the header
     * cell and the content container do not share, and the render window here
     * always starts at index 0, so document order is index order.
     */
    const findCells = (): ReturnType<typeof screen.getByTestId>[] => {
      const cells: ReturnType<typeof screen.getByTestId>[] = [];
      const collect = (node: ReturnType<typeof screen.getByTestId>): void => {
        if (
          node.type === 'View' &&
          typeof node.props.onLayout === 'function' &&
          typeof node.props.onFocusCapture === 'function'
        ) {
          cells.push(node);
        }
        for (const child of node.children) {
          if (typeof child !== 'string') {
            collect(child);
          }
        }
      };
      collect(screen.getByTestId('pattern-steps'));

      return cells;
    };

    const measureCells = async (): Promise<number> => {
      const listNow = screen.getByTestId('pattern-steps');
      const cells = findCells();

      // Every handler is invoked directly, inside ONE `act`, rather than through
      // a `fireEvent` each: awaiting between them would let the queued macrotask
      // run half way through this batch's measurement, and the ordering these
      // cases exist to pin would be untestable. One `act` measures the whole
      // batch before anything can observe it — which is what one commit does.
      await act(() => {
        // The list's own `onLayout` gives `VirtualizedList` a viewport length;
        // it renders no batch beyond the initial one until it has one.
        listNow.props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
        });
        for (const [index, cell] of cells.entries()) {
          cell.props.onLayout({
            nativeEvent: {
              layout: {
                x: 0,
                y: HEADER_HEIGHT + index * ROW_HEIGHT,
                width: 390,
                height: ROW_HEIGHT,
              },
            },
          });
        }
      });

      return cells.length;
    };

    /**
     * One real fill batch, in the order the platform produces it: the content
     * container's own `onLayout` (which is what `onContentSizeChange` is), THEN
     * the `onLayout` of the cells that same commit laid out — Fabric emits
     * parent before child — and only then the macrotask the hook defers its
     * attempt to. Firing these in this order is the whole point of the two cases
     * below; an implementation that attempts inline sees the metrics of the
     * PREVIOUS batch and never lands on the last one.
     */
    const fireFillBatch = async (
      list: ReturnType<typeof screen.getByTestId>,
    ): Promise<number> => {
      await fireEvent(list, 'contentSizeChange', 390, 3000);
      const measured = await measureCells();
      await flushDeferredAttempt(FILL_BATCH_PERIOD_MS);

      return measured;
    };

    /**
     * Wait for `VirtualizedList` to widen its render window to `count` rows. It
     * does that from a `Batchinator` on its own clock, so polling for it keeps
     * the fill-batch cases off a fixed sleep.
     */
    const waitForRenderedCells = async (count: number): Promise<void> => {
      await waitFor(() => {
        expect(findCells()).toHaveLength(count);
      });
    };

    const createPatternOfLength = (
      length: number,
      completeThrough: number,
    ): string => {
      const created = repositories.patterns.createPattern({
        title: 'Long Blanket',
        steps: Array.from({ length }, (_, index) => `Row ${index + 1}`),
      });
      for (const step of created.steps.slice(0, completeThrough)) {
        repositories.progress.setStepCompleted(step.id, true);
      }

      return created.pattern.id;
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

    // The three cases below feed real cell layouts, so they reach the branch the
    // whole feature depends on — `VirtualizedList.scrollToIndex`'s LANDING half,
    // where a measured index skips `onScrollToIndexFailed` and computes an
    // offset from `getCellMetricsApprox`. The eight cases above can only reach
    // its failure half, because nothing in them measures a cell.
    //
    // They also pin the ordering fact the mechanism now turns on:
    // `onContentSizeChange` IS the content container's `onLayout`, Fabric emits
    // a parent's `onLayout` before its children's, so the cells a commit lays
    // out are measured only AFTER the content-size handler has returned. Every
    // fill batch below is therefore fired in that order — content size, then the
    // cells, then the macrotask.

    it('lands on the measured current step of a short pattern, at the row own offset', async () => {
      const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex');
      // Left as a recording no-op: letting it through would drive the mocked
      // native scroll commands, and the offset it is ASKED for is the assertion.
      const scrollToOffset = jest
        .spyOn(VirtualizedList.prototype, 'scrollToOffset')
        .mockImplementation(() => {});

      // Six steps with four complete: step 5 is current, at index 4. This is the
      // shape of every bundled starter pattern (6-7 steps), and it produces
      // exactly ONE content-size change — the whole list fits in the initial
      // render batch, so no later fire ever arrives to retry on. An attempt made
      // inline in that single fire reads zero measured cells and the maker never
      // moves.
      const short = createPatternOfLength(6, 4);
      const list = await openLongBlanket(short, 'restore-short');

      const measured = await fireFillBatch(list);
      expect(measured).toBe(6);

      expect(scrollToIndex).toHaveBeenCalledTimes(1);
      expect(scrollToIndex).toHaveBeenCalledWith(SCROLL_TO_CURRENT(4));
      // The landing offset is the target row's OWN content-container-relative
      // `y`, which already contains the 200pt header the fixture laid out above
      // it — never `averageItemLength × index`, which would be 320 here and land
      // inside the counter card. This is the arithmetic half of AC2; the device
      // check is what proves the real layout produces such a `y`.
      expect(scrollToOffset).toHaveBeenCalledTimes(1);
      expect(scrollToOffset).toHaveBeenCalledWith({
        animated: false,
        offset: HEADER_HEIGHT + 4 * ROW_HEIGHT,
      });
    });

    it('restores a current step that sits in the final fill batch', async () => {
      const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex');
      const scrollToOffset = jest
        .spyOn(VirtualizedList.prototype, 'scrollToOffset')
        .mockImplementation(() => {});

      // Twenty steps with fourteen complete: step 15 is current, at index 14 —
      // inside the SECOND and last fill batch (`initialNumToRender` 10 +
      // `maxToRenderPerBatch` 10). There is no third batch and so no third
      // content-size change, so an attempt that reads the previous batch's
      // metrics has no later fire to be rescued by: the maker opens at the title
      // and stays there.
      const long = createPatternOfLength(20, 14);
      const list = await openLongBlanket(long, 'restore-final-batch');

      // Batch one: rows 0-9. Index 14 is genuinely unmeasured, so this attempt
      // must fail and must not settle.
      expect(await fireFillBatch(list)).toBe(10);
      expect(scrollToOffset).not.toHaveBeenCalled();
      expect(scrollToIndex).toHaveBeenCalledTimes(1);

      // Batch two: rows 10-19, the last one.
      await waitForRenderedCells(20);
      expect(await fireFillBatch(list)).toBe(20);

      expect(scrollToIndex).toHaveBeenCalledTimes(2);
      expect(scrollToIndex).toHaveBeenLastCalledWith(SCROLL_TO_CURRENT(14));
      expect(scrollToOffset).toHaveBeenCalledTimes(1);
      expect(scrollToOffset).toHaveBeenCalledWith({
        animated: false,
        offset: HEADER_HEIGHT + 14 * ROW_HEIGHT,
      });
    });

    it('spends one attempt on a burst of content-size changes, not one each', async () => {
      const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex');
      const long = createLongPattern({ activeStepIndex: 19 });

      const list = await openLongBlanket(long.id, 'restore-burst');

      // Three commits before the runtime gets back to the task queue. Each fire
      // replaces the pending attempt rather than adding one; without that, a
      // burst of commits during the initial fill would spend the whole
      // five-attempt cap before the list had rendered far enough to land.
      await fireEvent(list, 'contentSizeChange', 390, 1000);
      await fireEvent(list, 'contentSizeChange', 390, 2000);
      await fireEvent(list, 'contentSizeChange', 390, 3000);
      await flushDeferredAttempt(0);

      expect(scrollToIndex).toHaveBeenCalledTimes(1);
      expect(scrollToIndex).toHaveBeenCalledWith(SCROLL_TO_CURRENT(19));

      // …and the cap is otherwise untouched: four attempts are still available.
      for (let fire = 0; fire < 5; fire += 1) {
        await fireContentSizeChange(list);
      }
      expect(scrollToIndex).toHaveBeenCalledTimes(5);
    });
  });
});
