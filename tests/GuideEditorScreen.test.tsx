import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import type {
  FetchGuideMetadataResult,
  GuideMetadataGateway,
} from '@/data/contracts/guideMetadataGateway';
import { GuideEditorScreen } from '@/features/guides/presentation/GuideEditorScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';
import { GuideMetadataContext } from '@/ui/guides/guideMetadataContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
}));

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function fakeGateway(result: FetchGuideMetadataResult): GuideMetadataGateway {
  return { fetchMetadata: jest.fn(async () => result) };
}

function tree(
  repositories: Repositories,
  gateway: GuideMetadataGateway,
  guideId: string,
) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <GuideMetadataContext.Provider value={gateway}>
          <GuideEditorScreen guideId={guideId} />
        </GuideMetadataContext.Provider>
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

function offlineGateway(): GuideMetadataGateway {
  return fakeGateway({ status: 'unavailable', reason: 'offline' });
}

function seedBareGuide(repositories: Repositories) {
  // A saved guide with no creator/thumbnail/notes and no steps — the #9
  // metadata-unavailable outcome (FR-GU-08).
  return repositories.guides.saveImportedGuide({
    guide: {
      videoId: 'dQw4w9WgXcQ',
      sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Amigurumi Basics',
    },
    steps: [],
  });
}

describe('GuideEditorScreen', () => {
  let database: TestDatabase;
  let repositories: Repositories;

  beforeEach(() => {
    mockReplace.mockClear();
    mockBack.mockClear();
    database = createTestDatabase();
    repositories = database.repositories;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('authors a manual guide without metadata: adds timestamped steps that persist', async () => {
    const guide = seedBareGuide(repositories);
    await render(tree(repositories, offlineGateway(), guide.guide.id));
    await screen.findByRole('header', { name: 'Edit guide' });

    await fireEvent.changeText(
      screen.getByLabelText('New step instruction'),
      'Make a magic ring',
    );
    await fireEvent.changeText(
      screen.getByLabelText('New step timestamp'),
      '0:42',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add step' }));

    await fireEvent.changeText(
      screen.getByLabelText('New step instruction'),
      'Single crochet 6',
    );
    await fireEvent.changeText(
      screen.getByLabelText('New step timestamp'),
      '1:05',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add step' }));

    const steps =
      repositories.guides.getGuideWithSteps(guide.guide.id)?.steps ?? [];
    expect(steps.map((step) => step.instruction)).toStrictEqual([
      'Make a magic ring',
      'Single crochet 6',
    ]);
    // "0:42" → 42000 ms, "1:05" → 65000 ms (seconds, not raw or minutes).
    expect(steps.map((step) => step.videoOffsetMs)).toStrictEqual([42000, 65000]);
    expect(steps[0]?.transcriptExcerpt).toBeUndefined();
  });

  it('rejects an invalid timestamp and adds nothing', async () => {
    const guide = seedBareGuide(repositories);
    await render(tree(repositories, offlineGateway(), guide.guide.id));
    await screen.findByRole('header', { name: 'Edit guide' });

    await fireEvent.changeText(
      screen.getByLabelText('New step instruction'),
      'Bad step',
    );
    await fireEvent.changeText(
      screen.getByLabelText('New step timestamp'),
      '1:99',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add step' }));

    expect(
      screen.getByText('Enter a time like 0:45 or 1:05:20.'),
    ).toBeOnTheScreen();
    expect(repositories.guides.getGuideWithSteps(guide.guide.id)?.steps).toEqual(
      [],
    );
  });

  it('reorders and deletes steps offline, persisting the exact order', async () => {
    const guide = seedBareGuide(repositories);
    repositories.guides.addGuideStep(guide.guide.id, { instruction: 'A' });
    repositories.guides.addGuideStep(guide.guide.id, { instruction: 'B' });

    await render(tree(repositories, offlineGateway(), guide.guide.id));
    await screen.findByRole('header', { name: 'Edit guide' });

    // Move step 1 down: A, B -> B, A.
    await fireEvent.press(
      screen.getByRole('button', { name: 'Move step 1 down' }),
    );
    expect(
      repositories.guides
        .getGuideWithSteps(guide.guide.id)
        ?.steps.map((step) => step.instruction),
    ).toStrictEqual(['B', 'A']);

    // Delete step 1 (B) -> A remains.
    await fireEvent.press(
      screen.getByRole('button', { name: 'Delete step 1' }),
    );
    expect(
      repositories.guides
        .getGuideWithSteps(guide.guide.id)
        ?.steps.map((step) => step.instruction),
    ).toStrictEqual(['A']);
  });

  it('disables Move up on the first row and does nothing when pressed', async () => {
    const guide = seedBareGuide(repositories);
    repositories.guides.addGuideStep(guide.guide.id, { instruction: 'A' });
    repositories.guides.addGuideStep(guide.guide.id, { instruction: 'B' });

    await render(tree(repositories, offlineGateway(), guide.guide.id));
    await screen.findByRole('header', { name: 'Edit guide' });

    const moveUp = screen.getByLabelText('Move step 1 up');
    expect(moveUp.props.accessibilityState.disabled).toBe(true);

    // Pressing the disabled boundary control is a no-op: the order is unchanged.
    await fireEvent.press(moveUp);
    expect(
      repositories.guides
        .getGuideWithSteps(guide.guide.id)
        ?.steps.map((step) => step.instruction),
    ).toStrictEqual(['A', 'B']);
  });

  it('saves an edited title and notes, keeping Save disabled for a blank title', async () => {
    const guide = seedBareGuide(repositories);
    await render(tree(repositories, offlineGateway(), guide.guide.id));
    await screen.findByRole('header', { name: 'Edit guide' });

    await fireEvent.changeText(screen.getByLabelText('Guide title'), '   ');
    expect(
      screen.getByRole('button', { name: 'Save details' }).props
        .accessibilityState.disabled,
    ).toBe(true);

    await fireEvent.changeText(
      screen.getByLabelText('Guide title'),
      'Cosy Cowl',
    );
    await fireEvent.changeText(
      screen.getByLabelText('Guide notes'),
      '5mm hook',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save details' }));

    const saved = repositories.guides.getGuideWithSteps(guide.guide.id)?.guide;
    expect(saved?.title).toBe('Cosy Cowl');
    expect(saved?.notes).toBe('5mm hook');
  });

  it('applies fetched metadata on refresh without overwriting the maker title', async () => {
    const guide = seedBareGuide(repositories);
    const gateway = fakeGateway({
      status: 'ok',
      metadata: {
        title: 'A Different Provider Title',
        creator: 'Updated Creator',
        creatorUrl: undefined,
        thumbnailUrl: 'new.jpg',
      },
    });
    const refreshSpy = jest.spyOn(repositories.guides, 'refreshGuideMetadata');
    await render(tree(repositories, gateway, guide.guide.id));
    await screen.findByRole('header', { name: 'Edit guide' });

    await fireEvent.press(
      screen.getByRole('button', { name: 'Refresh metadata from YouTube' }),
    );

    expect(
      await screen.findByText('Guide details updated from YouTube.'),
    ).toBeOnTheScreen();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    const saved = repositories.guides.getGuideWithSteps(guide.guide.id)?.guide;
    // The maker's title is untouched; only provider fields changed.
    expect(saved?.title).toBe('Amigurumi Basics');
    expect(saved?.creator).toBe('Updated Creator');
  });

  it('leaves the saved guide unchanged when a refresh fails', async () => {
    const guide = seedBareGuide(repositories);
    repositories.guides.addGuideStep(guide.guide.id, { instruction: 'A' });
    const refreshSpy = jest.spyOn(repositories.guides, 'refreshGuideMetadata');
    await render(tree(repositories, offlineGateway(), guide.guide.id));
    await screen.findByRole('header', { name: 'Edit guide' });

    await fireEvent.press(
      screen.getByRole('button', { name: 'Refresh metadata from YouTube' }),
    );

    expect(
      await screen.findByText(/your saved guide is unchanged/i),
    ).toBeOnTheScreen();
    // The failure path performs no write, and the saved step is intact.
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(
      repositories.guides
        .getGuideWithSteps(guide.guide.id)
        ?.steps.map((step) => step.instruction),
    ).toStrictEqual(['A']);
  });

  it('deletes the guide only after confirmation and navigates back to guides', async () => {
    const guide = seedBareGuide(repositories);
    const deleteSpy = jest.spyOn(repositories.guides, 'deleteGuide');
    await render(tree(repositories, offlineGateway(), guide.guide.id));
    await screen.findByRole('header', { name: 'Edit guide' });

    await fireEvent.press(screen.getByRole('button', { name: 'Delete guide' }));
    expect(screen.getByRole('alert')).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Yes, delete guide' }),
    );

    expect(deleteSpy).toHaveBeenCalledWith(guide.guide.id);
    expect(mockReplace).toHaveBeenCalledWith('/guides');
  });

  it('keeps the guide when a deletion is cancelled', async () => {
    const guide = seedBareGuide(repositories);
    const deleteSpy = jest.spyOn(repositories.guides, 'deleteGuide');
    await render(tree(repositories, offlineGateway(), guide.guide.id));
    await screen.findByRole('header', { name: 'Edit guide' });

    await fireEvent.press(screen.getByRole('button', { name: 'Delete guide' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Keep guide' }));

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('tells the maker a stale guide id is no longer here', async () => {
    await render(tree(repositories, offlineGateway(), 'not-a-guide'));

    expect(
      await screen.findByRole('header', {
        name: 'This guide is no longer here',
      }),
    ).toBeOnTheScreen();
  });

  describe('pasting YouTube chapters or transcript text (issue #50)', () => {
    const PASTE_FIELD = 'Pasted YouTube chapters or transcript';
    const CHAPTERS =
      '0:00 Materials\n1:12 Magic ring\n2:40 Round 1\n5:03 Fasten off';

    async function pasteAndReview(text: string) {
      await fireEvent.changeText(screen.getByLabelText(PASTE_FIELD), text);
      await fireEvent.press(
        screen.getByRole('button', { name: 'Review pasted steps' }),
      );
    }

    /** Every string actually rendered on the screen, props excluded. */
    function renderedStrings(): string[] {
      const found: string[] = [];
      const visit = (node: unknown): void => {
        if (typeof node === 'string') {
          found.push(node);

          return;
        }
        if (Array.isArray(node)) {
          node.forEach(visit);

          return;
        }
        if (node !== null && typeof node === 'object' && 'children' in node) {
          visit((node as { children?: unknown }).children);
        }
      };
      visit(screen.toJSON());

      return found;
    }

    it('turns a pasted chapter block into imported steps on an explicit confirm', async () => {
      const guide = seedBareGuide(repositories);
      await render(tree(repositories, offlineGateway(), guide.guide.id));
      await screen.findByRole('header', { name: 'Edit guide' });

      await pasteAndReview(CHAPTERS);

      expect(
        screen.getByText('4 steps ready to review from your paste.'),
      ).toBeOnTheScreen();
      expect(
        screen.getByLabelText('Step 1 of 4 at 0:00: Materials'),
      ).toBeOnTheScreen();
      expect(
        screen.getByLabelText('Step 4 of 4 at 5:03: Fasten off'),
      ).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Add 4 steps' }));

      const steps =
        repositories.guides.getGuideWithSteps(guide.guide.id)?.steps ?? [];
      expect(steps.map((step) => step.instruction)).toStrictEqual([
        'Materials',
        'Magic ring',
        'Round 1',
        'Fasten off',
      ]);
      expect(steps.map((step) => step.videoOffsetMs)).toStrictEqual([
        0, 72000, 160000, 303000,
      ]);
      expect(steps.every((step) => step.origin === 'import')).toBe(true);
      // The raw paste is cleared from the field once it has been committed.
      expect(screen.getByLabelText(PASTE_FIELD).props.value).toBe('');
    });

    it('writes nothing when the review is discarded, leaving existing steps identical', async () => {
      const guide = seedBareGuide(repositories);
      repositories.guides.addGuideStep(guide.guide.id, {
        instruction: 'Typed A',
      });
      repositories.guides.addGuideStep(guide.guide.id, {
        instruction: 'Typed B',
      });
      const before = repositories.guides.getGuideWithSteps(guide.guide.id);

      await render(tree(repositories, offlineGateway(), guide.guide.id));
      await screen.findByRole('header', { name: 'Edit guide' });

      await pasteAndReview(CHAPTERS);
      expect(
        screen.getByText('4 steps ready to review from your paste.'),
      ).toBeOnTheScreen();

      // Reaching review is itself write-free: nothing has landed yet.
      expect(
        repositories.guides.getGuideWithSteps(guide.guide.id)?.steps,
      ).toStrictEqual(before?.steps);

      await fireEvent.press(
        screen.getByRole('button', { name: 'Discard pasted steps' }),
      );

      const after = repositories.guides.getGuideWithSteps(guide.guide.id);
      // Byte-identical: same ids, instructions, origins, and timestamps.
      expect(after?.steps).toStrictEqual(before?.steps);
      expect(after?.guide.updatedAt).toBe(before?.guide.updatedAt);
      // Back on the input phase, ready for another paste.
      expect(screen.getByLabelText(PASTE_FIELD).props.value).toBe('');
    });

    it('shows actionable copy for a paste with no timestamps and writes nothing', async () => {
      const guide = seedBareGuide(repositories);
      await render(tree(repositories, offlineGateway(), guide.guide.id));
      await screen.findByRole('header', { name: 'Edit guide' });

      await pasteAndReview('Chain 6 stitches SENTINELMAKERTEXT\nThen turn');

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(
        "We couldn't find any timestamps in that text. Copy the description's chapter list, or the transcript panel, and try again.",
      );
      // The review UI never appeared, and no step was written.
      expect(
        screen.queryByText(/ready to review from your paste/),
      ).not.toBeOnTheScreen();
      expect(
        repositories.guides.getGuideWithSteps(guide.guide.id)?.steps,
      ).toStrictEqual([]);
      // NFR-12: the maker's own text is never echoed into an error body.
      expect(screen.queryByText(/SENTINELMAKERTEXT/)).toBeNull();
      // Non-tautology arm: the walk sees the alert copy, so the sentinel's
      // absence below is a real absence rather than an empty scan.
      expect(renderedStrings()).toContain(
        "We couldn't find any timestamps in that text. Copy the description's chapter list, or the transcript panel, and try again.",
      );
      expect(
        renderedStrings().some((text) => text.includes('SENTINELMAKERTEXT')),
      ).toBe(false);
    });

    it('never presents pasted steps as something the app obtained (FR-YT-08)', async () => {
      const guide = seedBareGuide(repositories);
      await render(tree(repositories, offlineGateway(), guide.guide.id));
      await screen.findByRole('header', { name: 'Edit guide' });

      expect(
        screen.getByText(/you paste it, you review it, and you choose/),
      ).toBeOnTheScreen();

      await pasteAndReview(CHAPTERS);

      // Non-tautology arm: the walk really does see the rendered content, so an
      // empty result below cannot come from an empty scan.
      expect(renderedStrings()).toContain('Materials');
      expect(
        renderedStrings().filter((text) => /fetch|retriev|download/i.test(text)),
      ).toStrictEqual([]);
    });

    it('keeps hand-typed authoring working alongside a confirmed paste (FR-GU-08)', async () => {
      const guide = seedBareGuide(repositories);
      await render(tree(repositories, offlineGateway(), guide.guide.id));
      await screen.findByRole('header', { name: 'Edit guide' });

      await pasteAndReview(CHAPTERS);
      await fireEvent.press(screen.getByRole('button', { name: 'Add 4 steps' }));

      await fireEvent.changeText(
        screen.getByLabelText('New step instruction'),
        'My own step',
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Add step' }));

      const steps =
        repositories.guides.getGuideWithSteps(guide.guide.id)?.steps ?? [];
      expect(steps.map((step) => step.instruction)).toStrictEqual([
        'Materials',
        'Magic ring',
        'Round 1',
        'Fasten off',
        'My own step',
      ]);
      expect(steps.map((step) => step.origin)).toStrictEqual([
        'import',
        'import',
        'import',
        'import',
        'user',
      ]);
      expect(steps.map((step) => step.position)).toStrictEqual([0, 1, 2, 3, 4]);
    });

    it('names the review timestamp without making it a seek button', async () => {
      const guide = seedBareGuide(repositories);
      await render(tree(repositories, offlineGateway(), guide.guide.id));
      await screen.findByRole('header', { name: 'Edit guide' });

      await pasteAndReview(CHAPTERS);

      // There is no player on the editor: the badge names the time, and the
      // seek control stays on the working view's step row.
      expect(screen.getByLabelText('Video timestamp 1:12')).toBeOnTheScreen();
      expect(
        screen.queryByRole('button', { name: 'Video timestamp 1:12' }),
      ).toBeNull();
      expect(
        screen.getByLabelText('Video timestamp 1:12').props.onPress,
      ).toBeUndefined();
    });
  });
});
