import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import type {
  FetchGuideMetadataResult,
  GuideMetadataGateway,
} from '@/data/contracts/guideMetadataGateway';
import { GuideImportScreen } from '@/features/guides/presentation/GuideImportScreen';
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

function tree(repositories: Repositories, gateway: GuideMetadataGateway) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <GuideMetadataContext.Provider value={gateway}>
          <GuideImportScreen />
        </GuideMetadataContext.Provider>
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

const OK_RESULT: FetchGuideMetadataResult = {
  status: 'ok',
  metadata: {
    title: 'Granny Square',
    creator: 'Yarn Co',
    creatorUrl: 'https://youtube.com/@yarnco',
    thumbnailUrl: 'https://i.ytimg.com/x.jpg',
  },
};

describe('GuideImportScreen', () => {
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

  it('rejects a bad link with a message and writes nothing', async () => {
    const gateway = fakeGateway(OK_RESULT);
    const saveSpy = jest.spyOn(repositories.guides, 'saveImportedGuide');
    await render(tree(repositories, gateway));

    await fireEvent.changeText(
      screen.getByLabelText('YouTube link'),
      'not a link',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Look up video' }));

    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(gateway.fetchMetadata).not.toHaveBeenCalled();
    // Still on the input phase: the URL field remains editable.
    expect(screen.getByLabelText('YouTube link')).toBeOnTheScreen();
  });

  it('advances a valid fresh link to the review form (no false rejection)', async () => {
    const gateway = fakeGateway(OK_RESULT);
    await render(tree(repositories, gateway));

    await fireEvent.changeText(
      screen.getByLabelText('YouTube link'),
      'https://youtu.be/dQw4w9WgXcQ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Look up video' }));

    // Reaches review with the metadata prefilled — no url-error shown.
    expect(await screen.findByLabelText('Guide title')).toHaveDisplayValue(
      'Granny Square',
    );
    expect(screen.getByLabelText('Guide creator')).toHaveDisplayValue('Yarn Co');
  });

  it('creates a guide from fetched metadata only on the explicit Create tap', async () => {
    const gateway = fakeGateway(OK_RESULT);
    const saveSpy = jest.spyOn(repositories.guides, 'saveImportedGuide');
    await render(tree(repositories, gateway));

    await fireEvent.changeText(
      screen.getByLabelText('YouTube link'),
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Look up video' }));
    await screen.findByLabelText('Guide title');

    // Reaching review has written nothing yet.
    expect(saveSpy).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Create guide' }));

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith({
      guide: expect.objectContaining({
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Granny Square',
        creator: 'Yarn Co',
        thumbnailUrl: 'https://i.ytimg.com/x.jpg',
        metadataSyncedAt: expect.any(Number),
      }),
      steps: [],
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('lets a maker create manually when metadata is unavailable, with no premature write', async () => {
    const gateway = fakeGateway({ status: 'unavailable', reason: 'offline' });
    const saveSpy = jest.spyOn(repositories.guides, 'saveImportedGuide');
    await render(tree(repositories, gateway));

    await fireEvent.changeText(
      screen.getByLabelText('YouTube link'),
      'https://youtu.be/dQw4w9WgXcQ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Look up video' }));

    // The non-blocking note appears and the fields are blank + editable.
    expect(
      await screen.findByText(/you can still create this guide/i),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Guide title')).toHaveDisplayValue('');
    // Create is disabled until a title is entered, and nothing is written yet.
    expect(
      screen.getByRole('button', { name: 'Create guide' }).props
        .accessibilityState.disabled,
    ).toBe(true);
    expect(saveSpy).not.toHaveBeenCalled();

    await fireEvent.changeText(
      screen.getByLabelText('Guide title'),
      'Amigurumi Basics',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Create guide' }));

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const arg = saveSpy.mock.calls[0]?.[0];
    expect(arg?.guide.title).toBe('Amigurumi Basics');
    expect(arg?.guide.creator).toBeUndefined();
    expect('thumbnailUrl' in (arg?.guide ?? {})).toBe(false);
    expect('metadataSyncedAt' in (arg?.guide ?? {})).toBe(false);
  });

  it('lands on the existing guide for an already-imported video without creating a duplicate', async () => {
    const existing = repositories.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Already Here',
      },
      steps: [],
    });
    const gateway = fakeGateway(OK_RESULT);
    const saveSpy = jest.spyOn(repositories.guides, 'saveImportedGuide');
    await render(tree(repositories, gateway));

    await fireEvent.changeText(
      screen.getByLabelText('YouTube link'),
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Look up video' }));

    expect(
      await screen.findByRole('button', { name: 'Open guide' }),
    ).toBeOnTheScreen();
    // No duplicate create, and no network call for a known video.
    expect(saveSpy).not.toHaveBeenCalled();
    expect(gateway.fetchMetadata).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Open guide' }));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/guides/[guideId]',
      params: { guideId: existing.guide.id },
    });
  });
});
