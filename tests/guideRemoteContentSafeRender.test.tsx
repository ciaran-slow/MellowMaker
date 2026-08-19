import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import type {
  FetchGuideMetadataResult,
  GuideMetadataGateway,
} from '@/data/contracts/guideMetadataGateway';
import type { GuideSummary } from '@/data/contracts/guideRepository';
import { GuideImportScreen } from '@/features/guides/presentation/GuideImportScreen';
import { GuideListRow } from '@/features/guides/presentation/GuideListRow';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';
import { GuideMetadataContext } from '@/ui/guides/guideMetadataContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

/**
 * Issue #13 (AC1 / FR-GU-07 / NFR-12): the render-layer falsifier. Remote
 * title/creator text must appear as LITERAL React Native `<Text>`, never
 * interpreted as markup or executed. The mapper keeps hostile free text verbatim
 * (youtubeOembedGateway.test.ts); this suite proves the display surface renders
 * that verbatim string as inert text — the layer where "never rendered as
 * executable markup" is actually implemented.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

// A payload that WOULD execute if any surface interpreted it as HTML.
const HOSTILE_TITLE = '<img src=x onerror="globalThis.__pwned=1">';
const HOSTILE_CREATOR = '<script>globalThis.__pwned=1</script>';

declare global {
  var __pwned: unknown;
}

function fakeGateway(result: FetchGuideMetadataResult): GuideMetadataGateway {
  return { fetchMetadata: jest.fn(async () => result) };
}

function summary(overrides: Partial<GuideSummary> = {}): GuideSummary {
  return {
    id: 'guide-1',
    videoId: 'dQw4w9WgXcQ',
    title: HOSTILE_TITLE,
    creator: HOSTILE_CREATOR,
    thumbnailUrl: undefined,
    updatedAt: 1,
    ...overrides,
  };
}

function listRowTree(guide: GuideSummary) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <GuideListRow guide={guide} />
    </SafeAreaProvider>
  );
}

function importTree(repositories: Repositories, gateway: GuideMetadataGateway) {
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

describe('remote guide content renders as inert literal text', () => {
  beforeEach(() => {
    delete (globalThis as { __pwned?: unknown }).__pwned;
  });

  afterEach(() => {
    delete (globalThis as { __pwned?: unknown }).__pwned;
    jest.restoreAllMocks();
  });

  it('shows a hostile guide title/creator as the exact literal string in a list row', async () => {
    await render(listRowTree(summary()));

    // The exact hostile bytes appear as on-screen Text — falsified if RN ever
    // interpreted the string as markup or altered/escaped it away.
    expect(screen.getByText(HOSTILE_TITLE)).toBeOnTheScreen();
    expect(screen.getByText(HOSTILE_CREATOR)).toBeOnTheScreen();
    // Nothing executed during render.
    expect(globalThis.__pwned).toBeUndefined();
  });

  it('renders a hostile fetched title as a literal editable value on the import review form', async () => {
    const database: TestDatabase = createTestDatabase();
    try {
      const gateway = fakeGateway({
        status: 'ok',
        metadata: {
          title: HOSTILE_TITLE,
          creator: HOSTILE_CREATOR,
          creatorUrl: undefined,
          thumbnailUrl: undefined,
        },
      });
      await render(importTree(database.repositories, gateway));

      await fireEvent.changeText(
        screen.getByLabelText('YouTube link'),
        'https://youtu.be/dQw4w9WgXcQ',
      );
      await fireEvent.press(
        screen.getByRole('button', { name: 'Look up video' }),
      );

      // The hostile string is the field's literal display value, not markup.
      expect(await screen.findByLabelText('Guide title')).toHaveDisplayValue(
        HOSTILE_TITLE,
      );
      expect(screen.getByLabelText('Guide creator')).toHaveDisplayValue(
        HOSTILE_CREATOR,
      );
      expect(globalThis.__pwned).toBeUndefined();
    } finally {
      database.close();
    }
  });
});
