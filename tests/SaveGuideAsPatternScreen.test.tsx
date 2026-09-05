import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import type { PatternRepository } from '@/data/contracts/patternRepository';
import { SaveGuideAsPatternScreen } from '@/features/guides/presentation/SaveGuideAsPatternScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

// The isolated screen renders outside a navigator, so navigation is stubbed; the
// guides navigation suite exercises the same two hops against the real router.
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
// `useFocusEffect` is captured rather than run, so the mount read stays the only
// automatic load and every existing case keeps its exact call counts. The
// revisit case fires the captured callback itself, which is what a second focus
// on this still-mounted hidden tab screen does.
const mockFocusEffect: { current: (() => void) | undefined } = {
  current: undefined,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useFocusEffect: (effect: () => void) => {
    mockFocusEffect.current = effect;
  },
}));

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function tree(repositories: Repositories, guideId: string) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <SaveGuideAsPatternScreen guideId={guideId} />
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

describe('SaveGuideAsPatternScreen', () => {
  let database: TestDatabase;
  let repositories: Repositories;

  const VIDEO_ID = 'dQw4w9WgXcQ';
  const SOURCE_LINE =
    'Saved from YouTube: https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  function seedGuide(
    instructions: readonly string[],
    notes?: string,
  ): string {
    const saved = repositories.guides.saveImportedGuide({
      guide: {
        videoId: VIDEO_ID,
        sourceUrl: `https://youtu.be/${VIDEO_ID}`,
        title: 'Amigurumi Basics',
        ...(notes === undefined ? {} : { notes }),
      },
      steps: instructions.map((instruction) => ({
        instruction,
        origin: 'import' as const,
      })),
    });

    return saved.guide.id;
  }

  beforeEach(() => {
    database = createTestDatabase();
    repositories = database.repositories;
    mockPush.mockClear();
    mockReplace.mockClear();
    mockBack.mockClear();
    mockCanGoBack.mockClear();
    mockCanGoBack.mockReturnValue(true);
    mockFocusEffect.current = undefined;
  });

  /** Re-runs the screen's focus effect, the way returning to it does. */
  async function refocus() {
    const effect = mockFocusEffect.current;
    if (effect === undefined) {
      throw new Error(
        'the review screen registered no focus effect, so it cannot re-read the guide on a return visit',
      );
    }

    await act(async () => {
      effect();
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('seeds the review from the guide: title, source line, and every step in order', async () => {
    const guideId = seedGuide(['Magic ring', 'Chain 12', 'Fasten off']);
    await render(tree(repositories, guideId));

    await screen.findByRole('header', { name: 'Save as pattern' });

    expect(screen.getByLabelText('Pattern title').props.value).toBe(
      'Amigurumi Basics',
    );
    expect(screen.getByText(SOURCE_LINE)).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Step 1 of 3: Magic ring'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 2 of 3: Chain 12')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Step 3 of 3: Fasten off'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('3 steps will be copied into your new pattern'),
    ).toBeOnTheScreen();
  });

  it('re-seeds the review and resets the title draft when the screen is focused again', async () => {
    const guideId = seedGuide(['Magic ring', 'Chain 12']);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });
    expect(
      screen.getByText('2 steps will be copied into your new pattern'),
    ).toBeOnTheScreen();

    // The maker starts renaming, leaves without saving, adds a step to the
    // guide, then comes back. This screen is a hidden `Tabs` route that stays
    // mounted, so nothing re-runs unless focus re-reads: the review must show
    // the guide as it is now, and the title must follow the freshly read guide
    // rather than the abandoned edit.
    await fireEvent.changeText(
      screen.getByLabelText('Pattern title'),
      'Half-typed name',
    );
    repositories.guides.addGuideStep(guideId, { instruction: 'Fasten off' });

    await refocus();

    expect(
      await screen.findByText('3 steps will be copied into your new pattern'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 3 of 3: Fasten off')).toBeOnTheScreen();
    expect(screen.getByLabelText('Pattern title').props.value).toBe(
      'Amigurumi Basics',
    );
  });

  it('reads the guide exactly once per focus', async () => {
    // The re-read is bounded work: one focus, one read. Nothing in the change
    // may turn returning to a still-mounted review into repeated reads.
    const guideId = seedGuide(['Magic ring']);
    const getGuideWithSteps = jest
      .fn()
      .mockImplementation((id: string) =>
        repositories.guides.getGuideWithSteps(id),
      );
    const counted: Repositories = {
      ...repositories,
      guides: { ...repositories.guides, getGuideWithSteps },
    };

    await render(tree(counted, guideId));
    await screen.findByText('1 step will be copied into your new pattern');
    expect(getGuideWithSteps).toHaveBeenCalledTimes(1);

    await refocus();

    await screen.findByText('1 step will be copied into your new pattern');
    expect(getGuideWithSteps).toHaveBeenCalledTimes(2);
  });

  it('re-seeds the title from a guide retitled between visits', async () => {
    const guideId = seedGuide(['Magic ring', 'Chain 12']);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });

    repositories.guides.updateGuideDetails({
      id: guideId,
      title: 'Amigurumi Basics, take two',
    });

    await refocus();

    // Pins the re-seed on the *guide's* title, not merely on "reset to whatever
    // the first visit read": a reset that re-used the stale draft would leave
    // the old name here.
    await screen.findByLabelText('Pattern title');
    expect(screen.getByLabelText('Pattern title').props.value).toBe(
      'Amigurumi Basics, take two',
    );
  });

  it('writes nothing until confirm — cancelling leaves the library untouched', async () => {
    const guideId = seedGuide(['Magic ring', 'Chain 12', 'Fasten off']);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });

    // Reaching the review is a read: the library is still empty.
    expect(repositories.patterns.listPatterns()).toStrictEqual([]);

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(repositories.patterns.listPatterns()).toStrictEqual([]);
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces onto the guide when there is no back history to cancel to', async () => {
    mockCanGoBack.mockReturnValue(false);
    const guideId = seedGuide(['Magic ring']);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/guides/[guideId]',
      params: { guideId },
    });
    expect(repositories.patterns.listPatterns()).toStrictEqual([]);
  });

  it('writes one pattern with the guide’s steps and notes, then opens it', async () => {
    const guideId = seedGuide(
      ['Magic ring', 'Chain 12', 'Fasten off'],
      'Hook 4.0 mm',
    );
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });

    await fireEvent.press(screen.getByRole('button', { name: 'Save pattern' }));

    const saved = repositories.patterns.listPatterns();
    expect(saved).toHaveLength(1);
    const created = repositories.patterns.getPatternWithSteps(
      saved[0]?.id ?? '',
    );
    expect(created?.pattern.title).toBe('Amigurumi Basics');
    expect(created?.pattern.notes).toContain(SOURCE_LINE);
    expect(created?.pattern.notes).toContain('Hook 4.0 mm');
    expect(created?.steps.map((step) => step.instruction)).toStrictEqual([
      'Magic ring',
      'Chain 12',
      'Fasten off',
    ]);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/patterns/[patternId]',
      params: { patternId: saved[0]?.id },
    });
  });

  it('commits the draft that was reviewed, not a re-read of the guide', async () => {
    // The hook deliberately does not re-read at save time, so a guide edited
    // between review and confirm cannot silently change what the maker approved.
    // This goes red under any implementation that calls `getGuideWithSteps`
    // again inside `save`.
    const guideId = seedGuide(['Magic ring', 'Chain 12']);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });

    repositories.guides.addGuideStep(guideId, {
      instruction: 'Added after the review was on screen',
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Save pattern' }));

    const saved = repositories.patterns.listPatterns();
    expect(saved).toHaveLength(1);
    expect(
      repositories.patterns
        .getPatternWithSteps(saved[0]?.id ?? '')
        ?.steps.map((step) => step.instruction),
    ).toStrictEqual(['Magic ring', 'Chain 12']);
  });

  it('refuses an empty title and writes nothing', async () => {
    const guideId = seedGuide(['Magic ring']);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });

    await fireEvent.changeText(screen.getByLabelText('Pattern title'), '   ');

    const confirm = screen.getByRole('button', { name: 'Save pattern' });
    expect(confirm.props.accessibilityState.disabled).toBe(true);
    expect(
      screen.getByText('Give your pattern a name to save it.'),
    ).toBeOnTheScreen();

    await fireEvent.press(confirm);

    expect(repositories.patterns.listPatterns()).toStrictEqual([]);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('lets the maker rename before confirming — the seed is a default, not a lock', async () => {
    const guideId = seedGuide(['Magic ring', 'Chain 12']);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });

    await fireEvent.changeText(
      screen.getByLabelText('Pattern title'),
      'Hedgehog for Ana',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save pattern' }));

    const saved = repositories.patterns.listPatterns();
    expect(saved).toHaveLength(1);
    const created = repositories.patterns.getPatternWithSteps(
      saved[0]?.id ?? '',
    );
    expect(created?.pattern.title).toBe('Hedgehog for Ana');
    expect(created?.pattern.notes).toContain(SOURCE_LINE);
    expect(created?.steps.map((step) => step.instruction)).toStrictEqual([
      'Magic ring',
      'Chain 12',
    ]);
  });

  // Both branches of the empty-steps rule: the scenario it serves, and the
  // scenario it must not break.
  it('refuses to save a guide that has no steps yet', async () => {
    const guideId = seedGuide([]);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });

    expect(
      screen.getByText(
        'This guide has no steps yet. Add steps to the guide, then save it as a pattern.',
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('This guide has no steps to copy yet'),
    ).toBeOnTheScreen();

    const confirm = screen.getByRole('button', { name: 'Save pattern' });
    expect(confirm.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(confirm);

    expect(repositories.patterns.listPatterns()).toStrictEqual([]);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('saves a one-step guide, which the empty rule must not block', async () => {
    const guideId = seedGuide(['Magic ring']);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });

    const confirm = screen.getByRole('button', { name: 'Save pattern' });
    expect(confirm.props.accessibilityState.disabled).toBe(false);
    expect(
      screen.getByText('1 step will be copied into your new pattern'),
    ).toBeOnTheScreen();

    await fireEvent.press(confirm);

    const saved = repositories.patterns.listPatterns();
    expect(saved).toHaveLength(1);
    expect(
      repositories.patterns
        .getPatternWithSteps(saved[0]?.id ?? '')
        ?.steps.map((step) => step.instruction),
    ).toStrictEqual(['Magic ring']);
  });

  it('tells the maker a stale guide id is no longer here, and writes nothing', async () => {
    await render(tree(repositories, 'not-a-guide'));

    expect(
      await screen.findByRole('header', {
        name: 'This guide is no longer here',
      }),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'Save pattern' }),
    ).not.toBeOnTheScreen();
    expect(repositories.patterns.listPatterns()).toStrictEqual([]);
  });

  it('offers a retry when the guide read fails, and recovers to the seeded review', async () => {
    const guideId = seedGuide(['Magic ring', 'Chain 12']);
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
      await screen.findByRole('header', {
        name: "We couldn't save that pattern",
      }),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByText('2 steps will be copied into your new pattern'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Pattern title').props.value).toBe(
      'Amigurumi Basics',
    );
  });

  it('does not navigate when the commit itself fails', async () => {
    const guideId = seedGuide(['Magic ring']);
    const createPattern = jest.fn(() => {
      throw new Error('simulated write failure');
    }) as unknown as PatternRepository['createPattern'];
    const failing: Repositories = {
      ...repositories,
      patterns: { ...repositories.patterns, createPattern },
    };

    await render(tree(failing, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });

    await fireEvent.press(screen.getByRole('button', { name: 'Save pattern' }));

    expect(
      await screen.findByRole('header', {
        name: "We couldn't save that pattern",
      }),
    ).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(repositories.patterns.listPatterns()).toStrictEqual([]);
  });

  it('speaks the step count on iOS once the draft resolves (A11Y-07)', async () => {
    // `useAnnouncement` is deliberately silent on first render, so this fails if
    // the announcement is mounted inside the `ready` branch instead of at screen
    // level — the exact trap the screen-level mount avoids.
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();

    const guideId = seedGuide(['Magic ring', 'Chain 12', 'Fasten off']);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });

    expect(announce.mock.calls.map(([text]) => text)).toContain(
      '3 steps will be copied into your new pattern',
    );
  });

  it('speaks the same commit-failure title the alert renders, on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();

    const guideId = seedGuide(['Magic ring']);
    const createPattern = jest.fn(() => {
      throw new Error('simulated write failure');
    }) as unknown as PatternRepository['createPattern'];
    const failing: Repositories = {
      ...repositories,
      patterns: { ...repositories.patterns, createPattern },
    };

    await render(tree(failing, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });
    await fireEvent.press(screen.getByRole('button', { name: 'Save pattern' }));

    await screen.findByRole('header', { name: "We couldn't save that pattern" });
    expect(announce).toHaveBeenCalledWith("We couldn't save that pattern");
  });

  it('gives both decisions a full touch target', async () => {
    const guideId = seedGuide(['Magic ring']);
    await render(tree(repositories, guideId));
    await screen.findByRole('header', { name: 'Save as pattern' });

    // NativeWind classes are unresolved under `jest-expo` (architecture §14), so
    // this asserts the INLINE `tokens.touch.minimum` style `CraftPressable`
    // applies — a class-expressed minimum could neither be seen nor failed on.
    expect(screen.getByRole('button', { name: 'Save pattern' })).toHaveStyle({
      minHeight: 48,
    });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveStyle({
      minHeight: 48,
    });
  });
});
