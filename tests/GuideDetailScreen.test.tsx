import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import type {
  FetchGuideMetadataResult,
  GuideMetadataGateway,
} from '@/data/contracts/guideMetadataGateway';
import { GuideDetailScreen } from '@/features/guides/presentation/GuideDetailScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';
import { GuideMetadataContext } from '@/ui/guides/guideMetadataContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

const mockBack = jest.fn();
const mockReplace = jest.fn();

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
          <GuideDetailScreen guideId={guideId} />
        </GuideMetadataContext.Provider>
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

function seedGuide(repositories: Repositories) {
  return repositories.guides.saveImportedGuide({
    guide: {
      videoId: 'dQw4w9WgXcQ',
      sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'My Guide',
      creator: 'Original Creator',
      thumbnailUrl: 'old.jpg',
    },
    steps: [{ instruction: 'Row 1', origin: 'user' }],
  });
}

describe('GuideDetailScreen', () => {
  let database: TestDatabase;
  let repositories: Repositories;

  beforeEach(() => {
    mockBack.mockClear();
    mockReplace.mockClear();
    database = createTestDatabase();
    repositories = database.repositories;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('renders the saved guide metadata', async () => {
    const guide = seedGuide(repositories);
    await render(tree(repositories, fakeGateway({
      status: 'unavailable',
      reason: 'offline',
    }), guide.guide.id));

    expect(
      await screen.findByRole('header', { name: 'My Guide' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('By Original Creator')).toBeOnTheScreen();
  });

  it('applies fetched metadata on refresh without changing the title', async () => {
    const guide = seedGuide(repositories);
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
    await screen.findByRole('header', { name: 'My Guide' });

    await fireEvent.press(
      screen.getByRole('button', { name: 'Refresh metadata from YouTube' }),
    );

    expect(await screen.findByText('By Updated Creator')).toBeOnTheScreen();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    // The maker's title is never overwritten by a provider title.
    expect(screen.getByRole('header', { name: 'My Guide' })).toBeOnTheScreen();
    expect(
      screen.queryByText('A Different Provider Title'),
    ).not.toBeOnTheScreen();
  });

  it('leaves the saved guide unchanged when a refresh fails', async () => {
    const guide = seedGuide(repositories);
    const gateway = fakeGateway({ status: 'unavailable', reason: 'offline' });
    const refreshSpy = jest.spyOn(repositories.guides, 'refreshGuideMetadata');
    await render(tree(repositories, gateway, guide.guide.id));
    await screen.findByRole('header', { name: 'My Guide' });

    await fireEvent.press(
      screen.getByRole('button', { name: 'Refresh metadata from YouTube' }),
    );

    expect(
      await screen.findByText(/your saved guide is unchanged/i),
    ).toBeOnTheScreen();
    // The failure path performs no write.
    expect(refreshSpy).not.toHaveBeenCalled();
    // The rendered guide is identical to before.
    expect(screen.getByRole('header', { name: 'My Guide' })).toBeOnTheScreen();
    expect(screen.getByText('By Original Creator')).toBeOnTheScreen();
  });

  it('deletes the guide only after the confirmation and navigates back', async () => {
    const guide = seedGuide(repositories);
    const deleteSpy = jest.spyOn(repositories.guides, 'deleteGuide');
    await render(tree(repositories, fakeGateway({
      status: 'unavailable',
      reason: 'offline',
    }), guide.guide.id));
    await screen.findByRole('header', { name: 'My Guide' });

    await fireEvent.press(screen.getByRole('button', { name: 'Delete guide' }));
    expect(screen.getByRole('alert')).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Yes, delete guide' }),
    );

    expect(deleteSpy).toHaveBeenCalledWith(guide.guide.id);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the guide when a deletion is cancelled', async () => {
    const guide = seedGuide(repositories);
    const deleteSpy = jest.spyOn(repositories.guides, 'deleteGuide');
    await render(tree(repositories, fakeGateway({
      status: 'unavailable',
      reason: 'offline',
    }), guide.guide.id));
    await screen.findByRole('header', { name: 'My Guide' });

    await fireEvent.press(screen.getByRole('button', { name: 'Delete guide' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Keep guide' }));

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
