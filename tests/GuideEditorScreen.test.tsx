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
});
