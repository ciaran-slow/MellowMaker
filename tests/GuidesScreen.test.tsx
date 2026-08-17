import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import { GuidesScreen } from '@/features/guides/presentation/GuidesScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

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

function tree(repositories: Repositories) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <GuidesScreen />
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

describe('GuidesScreen', () => {
  let database: TestDatabase;
  let base: Repositories;

  beforeEach(() => {
    mockPush.mockClear();
    database = createTestDatabase();
    base = database.repositories;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('shows the empty-state CTA when there are no guides', async () => {
    await render(tree(base));

    expect(
      await screen.findByRole('header', { name: 'No guides yet' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Import your first guide' }),
    ).toBeOnTheScreen();
  });

  it('renders saved guides and opens one on press', async () => {
    const saved = base.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Amigurumi Basics',
        creator: 'Yarn Co',
      },
      steps: [],
    });

    await render(tree(base));

    const row = await screen.findByLabelText('Amigurumi Basics. By Yarn Co');
    expect(row).toBeOnTheScreen();

    await fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/guides/[guideId]',
      params: { guideId: saved.guide.id },
    });
  });

  it('shows a retryable alert when the library read fails', async () => {
    const repositories: Repositories = {
      ...base,
      guides: {
        ...base.guides,
        listGuides: () => {
          throw new Error('read failed');
        },
      },
    };

    await render(tree(repositories));

    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeOnTheScreen();
  });
});
