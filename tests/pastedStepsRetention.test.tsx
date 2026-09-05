import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import type { GuideMetadataGateway } from '@/data/contracts/guideMetadataGateway';
import { GuideEditorScreen } from '@/features/guides/presentation/GuideEditorScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';
import { GuideMetadataContext } from '@/ui/guides/guideMetadataContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

/**
 * Issue #50 / NFR-13: the raw paste is transient input, never a stored artefact.
 * Only the text that becomes a step's `instruction`/`transcript_excerpt` reaches
 * SQLite.
 *
 * The check is a **walk of every table in `sqlite_master`**, stringifying every
 * column of every row, rather than a look at the two columns this issue writes:
 * a blob stashed anywhere — a log table, a draft table, a column added later —
 * is caught, and a table added by a future migration joins the scan by default.
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

/**
 * The sentinel rides on a header line **above** the first time code, which the
 * parser discards, so a correct implementation can never carry it into a step
 * and only a stored raw blob could put it in the database.
 */
const RAW_ONLY_SENTINEL = 'RAWPASTEONLYSENTINEL';
const PASTE = `Chapters: ${RAW_ONLY_SENTINEL}\n0:00 Materials\n1:12 Magic ring\n2:40 Round 1\n5:03 Fasten off`;

function offlineGateway(): GuideMetadataGateway {
  return {
    fetchMetadata: jest.fn(async () => ({
      status: 'unavailable' as const,
      reason: 'offline' as const,
    })),
  };
}

function tree(repositories: Repositories, guideId: string) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <GuideMetadataContext.Provider value={offlineGateway()}>
          <GuideEditorScreen guideId={guideId} />
        </GuideMetadataContext.Provider>
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

describe('the raw paste never reaches SQLite', () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = createTestDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('stores only the derived step text, in no table and no column', async () => {
    const { repositories, connection } = database;
    const guide = repositories.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Amigurumi Basics',
      },
      steps: [],
    });

    await render(tree(repositories, guide.guide.id));
    await screen.findByRole('header', { name: 'Edit guide' });

    await fireEvent.changeText(
      screen.getByLabelText('Pasted YouTube chapters or transcript'),
      PASTE,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Review pasted steps' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add 4 steps' }));

    const tables = connection
      .all<{ readonly name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      )
      .map((row) => row.name)
      .filter((name) => !name.startsWith('sqlite_'));

    // Guard-liveness: the scan found real tables, including the one this write
    // targets, so the sentinel assertion cannot pass over an unscanned database.
    expect(tables.length).toBeGreaterThan(0);
    expect(tables).toContain('guide_step');

    const cells = tables.flatMap((table) =>
      connection
        .all<Record<string, unknown>>(`SELECT * FROM ${table}`)
        .flatMap((row) => Object.values(row).map((value) => String(value))),
    );

    // Non-tautology: the derived label IS stored, so the database was written.
    expect(cells.some((cell) => cell.includes('Materials'))).toBe(true);
    // …and the raw paste's header line is nowhere in it.
    expect(cells.some((cell) => cell.includes(RAW_ONLY_SENTINEL))).toBe(false);
  });
});
