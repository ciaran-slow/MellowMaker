import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { GuideRepository } from '@/data/contracts/guideRepository';
import type { Repositories } from '@/data/contracts/appDatabase';
import { GuideWorkingViewScreen } from '@/features/guides/presentation/GuideWorkingViewScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';
import {
  getLastYoutubeProps,
  mockSeekTo,
  youtubePlayerLiveCount,
  youtubePlayerMountCount,
} from './support/youtubeIframeMock';

// The shared `react-native-youtube-iframe` stub (tests/setup.ts) renders nothing;
// these helpers drive the mocked player's readiness/error from a test.
async function firePlayerReady(): Promise<void> {
  await act(async () => {
    getLastYoutubeProps()?.onReady?.();
  });
}

async function firePlayerError(reason: string): Promise<void> {
  await act(async () => {
    getLastYoutubeProps()?.onError?.(reason);
  });
}

// The isolated screen renders outside a navigator, so router focus and
// navigation are stubbed; the navigation suite exercises the real router.
// `useFocusEffect` is a no-op so the initial mount read is the only load.
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
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
    mockPush.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('keeps the saved steps usable while the player is loading, never gating the list', async () => {
    const { guideId, stepIds } = seedGuide(repositories, ['Make a magic ring']);
    await render(tree(repositories, guideId));

    await screen.findByRole('header', { name: 'Amigurumi Basics' });

    // The player region shows its loading text, and the step list is BOTH
    // present and interactive: the player is a sibling above, never a gate.
    expect(screen.getByText('Loading video…')).toBeOnTheScreen();
    const complete = screen.getByLabelText('Mark step 1 complete');
    expect(complete).toBeOnTheScreen();

    await fireEvent.press(complete);
    expect(completedIds(repositories, guideId)).toStrictEqual([stepIds[0]]);
    expect(screen.getByText('Completed')).toBeOnTheScreen();
  });

  it('seeks the player to a step timestamp when the badge is pressed after ready', async () => {
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

    await firePlayerReady();
    await fireEvent.press(screen.getByLabelText('Video timestamp 0:42'));

    expect(mockSeekTo).toHaveBeenCalledWith(42, true);
  });

  it('keeps instructions, completion, and the counter usable when playback fails (FR-GU-06)', async () => {
    const saved = repositories.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Amigurumi Basics',
      },
      steps: [{ instruction: 'Chain 6', origin: 'user', videoOffsetMs: 42000 }],
    });
    const guideId = saved.guide.id;

    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Amigurumi Basics' });

    await firePlayerError('video_not_found');

    // The error text shows, but the workflow below stays fully usable.
    expect(screen.getByText(/unavailable/)).toBeOnTheScreen();

    // Pressing the timestamp badge is a guarded no-op — no seek while errored.
    await fireEvent.press(screen.getByLabelText('Video timestamp 0:42'));
    expect(mockSeekTo).not.toHaveBeenCalled();

    // Completion still works.
    await fireEvent.press(screen.getByLabelText('Mark step 1 complete'));
    expect(completedIds(repositories, guideId)).toStrictEqual(
      saved.steps.map((step) => step.id),
    );
    expect(screen.getByText('Completed')).toBeOnTheScreen();

    // The counter still increments.
    const increase = screen.getByLabelText('Increase Rows');
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

  it('recovers from a playback error via Try again without touching the guide repository (AC #3)', async () => {
    const { guideId } = seedGuide(repositories, ['Make a magic ring']);

    // Wrap every guide-repo method as a spy delegating to the real repository,
    // so a retry that reads or writes any of them is caught.
    const real = repositories.guides;
    const spied: GuideRepository = {
      saveImportedGuide: jest.fn(real.saveImportedGuide.bind(real)),
      findGuideByVideoId: jest.fn(real.findGuideByVideoId.bind(real)),
      getGuideWithSteps: jest.fn(real.getGuideWithSteps.bind(real)),
      listGuides: jest.fn(real.listGuides.bind(real)),
      refreshGuideMetadata: jest.fn(real.refreshGuideMetadata.bind(real)),
      updateGuideDetails: jest.fn(real.updateGuideDetails.bind(real)),
      addGuideStep: jest.fn(real.addGuideStep.bind(real)),
      appendImportedGuideSteps: jest.fn(
        real.appendImportedGuideSteps.bind(real),
      ),
      updateGuideStep: jest.fn(real.updateGuideStep.bind(real)),
      deleteGuideStep: jest.fn(real.deleteGuideStep.bind(real)),
      reorderGuideSteps: jest.fn(real.reorderGuideSteps.bind(real)),
      setGuideStepCompleted: jest.fn(real.setGuideStepCompleted.bind(real)),
      deleteGuide: jest.fn(real.deleteGuide.bind(real)),
    };
    const observed: Repositories = { ...repositories, guides: spied };

    await render(tree(observed, guideId));
    await screen.findByRole('header', { name: 'Amigurumi Basics' });

    await firePlayerError('HTML5_error');
    expect(
      screen.getByRole('button', { name: 'Try again to load the video' }),
    ).toBeOnTheScreen();

    // Clear every call made during the initial load; only the retry is observed.
    for (const method of Object.values(spied)) {
      (method as jest.Mock).mockClear();
    }

    await fireEvent.press(
      screen.getByRole('button', { name: 'Try again to load the video' }),
    );

    // The retry remounts the player only — zero repository calls.
    for (const method of Object.values(spied)) {
      expect(method as jest.Mock).not.toHaveBeenCalled();
    }

    // And the player is back out of the error state (its fallback is gone).
    expect(
      screen.queryByRole('button', { name: 'Try again to load the video' }),
    ).not.toBeOnTheScreen();
    // The list stayed usable throughout.
    expect(screen.getByLabelText('Mark step 1 complete')).toBeOnTheScreen();
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

  it('speaks step completion and the progress summary on iOS (A11Y-07)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();
    const { guideId } = seedGuide(repositories, ['A', 'B']);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Amigurumi Basics' });
    announce.mockClear();

    await fireEvent.press(screen.getByLabelText('Mark step 1 complete'));

    const spoken = announce.mock.calls.map(([text]) => text);
    expect(spoken.some((text) => /Step 1 completed/.test(String(text)))).toBe(true);
    expect(spoken).toContain('1 of 2 steps done');
  });

  it('speaks the same read-failure title the alert renders, on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();
    const { guideId } = seedGuide(repositories, ['A']);
    const failing: Repositories = {
      ...repositories,
      guides: {
        ...repositories.guides,
        getGuideWithSteps: jest.fn(() => {
          throw new Error('simulated read failure');
        }) as unknown as GuideRepository['getGuideWithSteps'],
      },
    };

    await render(tree(failing, guideId));
    await screen.findByRole('header', { name: "We couldn't open this guide" });

    expect(announce).toHaveBeenCalledWith("We couldn't open this guide");
  });

  // Issue #43 — the guide's chrome scrolls WITH the steps. Before the fix the
  // title, progress row, video card, counter, and announcement were siblings
  // ABOVE the list; on an 844pt phone that chrome stood ~897pt tall, so the
  // list was laid out entirely off-screen and nothing on the display scrolled.
  describe('one scroll surface (issue #43)', () => {
    it('renders the chrome inside the step list, leaving only the back control outside', async () => {
      const { guideId } = seedGuide(repositories, ['A', 'B', 'C']);
      await render(tree(repositories, guideId));
      await screen.findByRole('header', { name: 'Amigurumi Basics' });

      const list = screen.getByTestId('guide-steps');

      // Every piece of chrome is INSIDE the scroll surface…
      expect(
        within(list).getByRole('header', { name: 'Amigurumi Basics' }),
      ).toBeOnTheScreen();
      expect(within(list).getByLabelText('Edit guide')).toBeOnTheScreen();
      expect(within(list).getByText('Loading video…')).toBeOnTheScreen();
      expect(within(list).getByLabelText('Increase Rows')).toBeOnTheScreen();
      expect(
        within(list).getByLabelText('Mark step 1 complete'),
      ).toBeOnTheScreen();

      // …and the one bounded control that legitimately stays outside it is not.
      expect(within(list).queryByLabelText('Back to guides')).toBeNull();
      expect(screen.getByLabelText('Back to guides')).toBeOnTheScreen();
    });

    it('keeps the chrome in order: title, video, counter, then the steps', async () => {
      const { guideId } = seedGuide(repositories, ['A', 'B', 'C']);
      await render(tree(repositories, guideId));
      await screen.findByRole('header', { name: 'Amigurumi Basics' });

      const list = screen.getByTestId('guide-steps');

      // Containment alone (the case above) cannot see order: a header whose
      // counter sits above the video, or one passed as `ListFooterComponent`,
      // satisfies every `within(list)` query. The order IS the recorded UX-06
      // trade-off — "+" is reachable with one flick from the steps and without
      // scrolling past the video only because the counter is between them — so
      // it needs its own pin. Walking the subtree depth-first reproduces render
      // order, so a position in that walk is a position on screen.
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

      const title = within(list).getByRole('header', {
        name: 'Amigurumi Basics',
      });
      const progress = within(list).getByText('0 of 3 steps done');
      const editGuide = within(list).getByLabelText('Edit guide');
      const saveAsPattern = within(list).getByLabelText('Save as pattern');
      const video = within(list).getByText('Loading video…');
      const counter = within(list).getByLabelText('Increase Rows');
      const firstStep = within(list).getByLabelText('Mark step 1 complete');

      // The action row added by #51 sits with the rest of the chrome ABOVE the
      // video; pinning it here stops it drifting below the 16:9 card, where a
      // maker would have to scroll past the player to reach either action.
      expect(positionOf(title)).toBeLessThan(positionOf(progress));
      expect(positionOf(progress)).toBeLessThan(positionOf(editGuide));
      expect(positionOf(editGuide)).toBeLessThan(positionOf(saveAsPattern));
      expect(positionOf(saveAsPattern)).toBeLessThan(positionOf(video));
      expect(positionOf(video)).toBeLessThan(positionOf(counter));
      expect(positionOf(counter)).toBeLessThan(positionOf(firstStep));
    });

    it('gives the list a height that cannot depend on its header', async () => {
      const { guideId } = seedGuide(repositories, ['A']);
      await render(tree(repositories, guideId));
      await screen.findByRole('header', { name: 'Amigurumi Basics' });

      // NativeWind's stylesheet is mocked under Jest (jest.config maps `.css`
      // to `styleMock`), so `className` reaches the host element unresolved and
      // `props.style` is undefined — the class list is the only observable form
      // of this decision in a test. `flex-1` is `flexBasis: 0` + `flexGrow: 1`:
      // the list claims whatever the back control leaves, at any text size and
      // on any device, so a tall header can never starve it again.
      const classes = String(
        screen.getByTestId('guide-steps').props.className,
      ).split(/\s+/);
      expect(classes).toContain('flex-1');
    });

    it.each([
      ['loading', async () => {}],
      ['ready', firePlayerReady],
      ['error', async () => firePlayerError('video_not_found')],
    ])('keeps one scroll surface while the player is %s', async (state, drive) => {
      const { guideId } = seedGuide(repositories, ['A', 'B', 'C']);
      await render(tree(repositories, guideId));
      await screen.findByRole('header', { name: 'Amigurumi Basics' });

      await drive();

      const list = screen.getByTestId('guide-steps');
      expect(
        within(list).getByRole('header', { name: 'Amigurumi Basics' }),
      ).toBeOnTheScreen();
      expect(within(list).getByLabelText('Increase Rows')).toBeOnTheScreen();
      expect(
        within(list).getByLabelText('Mark step 1 complete'),
      ).toBeOnTheScreen();

      if (state === 'error') {
        // The placeholder replaces the WebView INSIDE the header — the failure
        // state must not push the chrome back above the list.
        expect(
          within(list).getByLabelText('Try again to load the video'),
        ).toBeOnTheScreen();
        expect(
          within(list).getByLabelText('Open in YouTube'),
        ).toBeOnTheScreen();
      }
    });

    it('never remounts the video player when a step or the counter changes', async () => {
      const { guideId } = seedGuide(repositories, ['A', 'B']);
      await render(tree(repositories, guideId));
      await screen.findByRole('header', { name: 'Amigurumi Basics' });

      await firePlayerReady();
      expect(youtubePlayerMountCount()).toBe(1);

      // An inline `ListHeaderComponent={() => …}` is a NEW component type on
      // every render, so React would unmount and remount the header subtree —
      // tearing down and reloading the WebView — on each of these taps. The
      // live count would still read 1 afterwards; only the cumulative mount
      // count can see it.
      await fireEvent.press(screen.getByLabelText('Mark step 1 complete'));
      const increase = screen.getByLabelText('Increase Rows');
      await fireEvent.press(increase);
      await fireEvent.press(increase);

      expect(youtubePlayerMountCount()).toBe(1);
      expect(youtubePlayerLiveCount()).toBe(1);
    });

    it('renders the chrome above the empty state when the guide has no steps', async () => {
      const { guideId } = seedGuide(repositories, []);
      await render(tree(repositories, guideId));
      await screen.findByRole('header', { name: 'Amigurumi Basics' });

      const list = screen.getByTestId('guide-steps');
      expect(
        within(list).getByRole('header', { name: 'Amigurumi Basics' }),
      ).toBeOnTheScreen();
      expect(within(list).getByLabelText('Increase Rows')).toBeOnTheScreen();
      expect(within(list).getByText('Loading video…')).toBeOnTheScreen();
      expect(
        within(list).getByRole('header', { name: 'No steps yet' }),
      ).toBeOnTheScreen();
    });

    it('keeps the Save as pattern control inside the scroll surface', async () => {
      const { guideId } = seedGuide(repositories, ['A', 'B', 'C']);
      await render(tree(repositories, guideId));
      await screen.findByRole('header', { name: 'Amigurumi Basics' });

      const control = within(screen.getByTestId('guide-steps')).getByRole(
        'button',
        { name: 'Save as pattern' },
      );

      expect(control).toBeOnTheScreen();
      expect(control.props.accessibilityHint).toBe(
        "Copy this guide's steps into a new pattern",
      );
      // The inline `tokens.touch.minimum` carrier from `CraftPressable`; a
      // class-expressed minimum is invisible to `toHaveStyle` here
      // (architecture §14), so this is the only real assertion available.
      expect(control).toHaveStyle({ minHeight: 48 });
    });

    it('pushes the review route rather than writing anything', async () => {
      const { guideId } = seedGuide(repositories, ['A', 'B', 'C']);
      await render(tree(repositories, guideId));
      await screen.findByRole('header', { name: 'Amigurumi Basics' });

      await fireEvent.press(
        screen.getByRole('button', { name: 'Save as pattern' }),
      );

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/guides/[guideId]/save-as-pattern',
        params: { guideId },
      });
      expect(repositories.patterns.listPatterns()).toStrictEqual([]);
    });

    it.each([
      ['a guide with no steps', [] as readonly string[], true],
      ['a guide with one step', ['A'] as readonly string[], false],
    ])(
      'disables Save as pattern for %s: %s',
      async (_label, instructions, expectedDisabled) => {
        const { guideId } = seedGuide(repositories, instructions);
        await render(tree(repositories, guideId));
        await screen.findByRole('header', { name: 'Amigurumi Basics' });

        const control = screen.getByRole('button', { name: 'Save as pattern' });
        expect(control.props.accessibilityState.disabled).toBe(expectedDisabled);

        await fireEvent.press(control);
        expect(mockPush).toHaveBeenCalledTimes(expectedDisabled ? 0 : 1);
      },
    );

    it('carries the list props the scroll decisions depend on', async () => {
      const { guideId } = seedGuide(repositories, ['A']);
      await render(tree(repositories, guideId));
      await screen.findByRole('header', { name: 'Amigurumi Basics' });

      const list = screen.getByTestId('guide-steps');

      // Structural guards: Jest has no layout engine and cannot simulate a
      // keyboard-swallowed tap, so these pin the decisions; the behaviour behind
      // them is proved on-device (see the #43 script on the issue).

      // Without this the counter's rename would need two taps: the first would
      // only dismiss the keyboard rather than press "Save name".
      expect(list.props.keyboardShouldPersistTaps).toBe('handled');

      // `getItemLayout` offsets are taken verbatim and the header's measured
      // height is tracked separately, never added to them — so an estimated-row
      // `initialScrollIndex` would scroll to a header-unaware offset, landing on
      // the wrong step and hiding the video.
      expect(list.props.getItemLayout).toBeUndefined();
      expect(list.props.initialScrollIndex).toBeUndefined();
    });
  });
});
