import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import { applyBundledPatternSeed } from '@/data/seed/patternSeed';
import { applyBundledStitchSeed } from '@/data/seed/stitchSeed';
import { DictionaryScreen } from '@/features/dictionary/presentation/DictionaryScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';

import { BASELINE, insertPopulatedBaseline } from './support/populatedBaseline';
import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

/**
 * AC1 / FR-DA-04 / NFR-01: the offline-first core boundary.
 *
 * Two independent falsifiers that the core (dictionary, patterns, progress,
 * counters, and saved-guide reads/writes) reaches for no network:
 *
 * (a) a behavioural airplane-mode cold start that runs the real migrations, the
 *     bundled seed, and a populated baseline, then exercises every core read and
 *     write with the global `fetch` stubbed to throw — asserting the core flows
 *     succeed AND `fetch` was never called;
 * (b) a static import guard proving the enumerated core modules reference no
 *     network seam, plus a non-tautology check that the two allowlisted feature
 *     files DO reference the gateway (so the guard is a real boundary);
 * (c) one offline `DictionaryScreen` render reaching loaded content.
 *
 * These complement the layer lint (which stops `src/data`/`src/domain` importing
 * `src/platform` but permits feature presentation to import the metadata
 * gateway) — this suite is what pins the *feature* core paths.
 */

const NETWORK_ERROR = 'airplane mode: no network';

describe('offline cold start — core reads and writes never touch the network', () => {
  let database: TestDatabase;
  let originalFetch: typeof globalThis.fetch;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    // Stub the global before anything opens the database, so any core path that
    // reached for the network during cold start would throw immediately.
    fetchSpy = jest.fn(() => {
      throw new Error(NETWORK_ERROR);
    });
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    database = createTestDatabase();
    // The maker's existing data is in place before the seeds run, which is the
    // real cold-start order: migrate, then seed over whatever is already stored.
    insertPopulatedBaseline(database.connection);
    applyBundledStitchSeed(database.repositories.stitches);
    applyBundledPatternSeed(database.repositories.patterns);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    database.close();
  });

  it('serves the dictionary from local storage', () => {
    const { stitches } = database.repositories;

    expect(
      stitches.searchStitches('  DC  ').map((stitch) => stitch.slug),
    ).toStrictEqual(['double-crochet', 'double-crochet-two-together']);

    const singleCrochet = stitches
      .searchStitches('single crochet')
      .find((stitch) => stitch.slug === 'single-crochet');
    expect(singleCrochet).toBeDefined();
    const detail = stitches.getStitchDetail(singleCrochet!.id);
    expect(detail?.instructions).toHaveLength(5);
    expect(detail?.instructions[0]?.instruction).toBe(
      'Insert the hook front to back under both top loops of the next stitch.',
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('serves the bundled starter patterns and lets a maker work one', () => {
    const { patterns, progress, counters } = database.repositories;

    // The maker's own work heads the library and the starters sit underneath
    // it, all served from local storage.
    expect(
      patterns.listPatterns({ limit: 200, offset: 0 }).map((row) => row.title),
    ).toStrictEqual([
      'Tiny Hedgehog',
      'Sunrise Blanket',
      'Practice Swatch',
      'Cotton Dishcloth',
      'Ridged Coaster',
      'Granny Square',
      'Ribbed Headband',
      'Simple Scarf',
    ]);

    const swatchId =
      database.connection.first<{ readonly pattern_id: string }>(
        'SELECT pattern_id FROM pattern_seed_state WHERE slug = ?',
        ['practice-swatch'],
      )?.pattern_id ?? '';
    const swatch = patterns.getPatternWithSteps(swatchId);

    expect(swatch?.pattern.origin).toBe('bundled');
    expect(swatch?.pattern.notes).toContain('Hook 5.0 mm');
    expect(swatch?.steps).toHaveLength(6);
    expect(swatch?.steps[0]?.instruction).toContain('Chain 21');

    progress.setStepCompleted(swatch?.steps[0]?.id ?? '', true);
    expect(progress.getProgress(swatchId).completedStepIds).toStrictEqual([
      swatch?.steps[0]?.id,
    ]);

    const counter = counters.getOrCreatePrimaryCounter({
      kind: 'pattern',
      id: swatchId,
    });
    expect(counters.adjustCounter(counter.id, 4).value).toBe(4);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('creates, edits, and reorders a pattern', () => {
    const { patterns } = database.repositories;

    const created = patterns.createPattern({
      title: 'Offline',
      steps: ['A', 'B'],
    });
    expect(created.steps).toHaveLength(2);
    const [stepA, stepB] = created.steps as [
      (typeof created.steps)[number],
      (typeof created.steps)[number],
    ];
    const stepC = patterns.addStep(created.pattern.id, 'C');

    patterns.reorderSteps(created.pattern.id, [stepC.id, stepA.id, stepB.id]);

    const reread = patterns.getPatternWithSteps(created.pattern.id);
    expect(reread?.steps.map((step) => step.instruction)).toStrictEqual([
      'C',
      'A',
      'B',
    ]);
    expect(reread?.steps.map((step) => step.position)).toStrictEqual([0, 1, 2]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads and updates step progress on the populated baseline', () => {
    const { progress } = database.repositories;
    const patternId = BASELINE.patterns[0].id;

    const before = progress.getProgress(patternId);
    expect(before.activeStepId).toBe('step-sunrise-1');
    expect(before.completedStepIds).toStrictEqual(['step-sunrise-0']);

    progress.setStepCompleted('step-sunrise-1', true);

    const after = progress.getProgress(patternId);
    expect(after.completedStepIds).toContain('step-sunrise-1');
    expect(after.completedStepIds).toContain('step-sunrise-0');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the populated counter and adjusts it', () => {
    const { counters } = database.repositories;

    // pattern-sunrise already carries a counter at 7 in the baseline, so the
    // primary accessor returns the populated row rather than a fresh zero.
    const primary = counters.getOrCreatePrimaryCounter({
      kind: 'pattern',
      id: BASELINE.patterns[0].id,
    });
    expect(primary.value).toBe(7);

    expect(counters.adjustCounter(primary.id, 5).value).toBe(12);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads a saved guide and lists it', () => {
    const { guides } = database.repositories;

    const saved = guides.getGuideWithSteps(BASELINE.guide.id);
    expect(saved?.guide.title).toBe('Granny square basics');
    expect(saved?.steps[0]?.instruction).toBe(
      'Make a magic ring and chain three',
    );

    expect(
      guides.listGuides().some((guide) => guide.id === BASELINE.guide.id),
    ).toBe(true);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/**
 * Static import guard: the enumerated core modules must reference no network
 * seam, and the two allowlisted feature files must reference the gateway (so the
 * guard cannot silently pass if the network seam were removed or renamed).
 */
describe('static core-network boundary guard', () => {
  const repoRoot = path.resolve(__dirname, '..');

  const NETWORK_TOKENS: readonly RegExp[] = [
    /@\/platform\/network/,
    /useGuideMetadataGateway/,
    /GuideMetadataGateway/,
    /\bfetch\s*\(/,
  ];

  /**
   * The gateway seam's own type contract lives under `src/data/contracts`; it is
   * the boundary definition, not a core consumer, so the textual scan excludes
   * it (the plan excludes "the gateway/context modules themselves"). Every real
   * core consumer that wired the network would still trip the guard.
   */
  const GUARD_EXCLUSIONS: readonly string[] = [
    path.join(repoRoot, 'src/data/contracts/guideMetadataGateway.ts'),
  ];

  function walk(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });

    return entries.flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(full);
      }
      if (/\.(ts|tsx)$/.test(entry.name)) {
        return [full];
      }

      return [];
    });
  }

  const guidePresentationDir = path.join(
    repoRoot,
    'src/features/guides/presentation',
  );

  // The two feature files that legitimately reach the network gateway (import
  // and metadata refresh). Excluded from the core scan, but separately asserted
  // to DO reference the gateway so the guard cannot pass vacuously.
  const allowlistedGatewayConsumers: readonly string[] = [
    'useGuideImport.ts',
    'useGuideEditor.ts',
  ].map((name) => path.join(guidePresentationDir, name));

  // Issue #11 WebView/IFrame playback seam — live video, not a core saved-data
  // read/write, so it is outside the offline core boundary.
  const guidePlayerSeam: readonly string[] = [
    'GuideVideoPlayer.tsx',
    'GuidePlayerPlaceholder.tsx',
    'useGuidePlayer.ts',
    'guidePlayback.ts',
  ].map((name) => path.join(guidePresentationDir, name));

  // Every OTHER guide-presentation file is a core saved-data path. Discover them
  // by WALKING the directory (not a hand-list) so a newly-added file joins the
  // scan by default — a file wired to the network can never silently escape the
  // guard just by being added.
  const guideCoreModules = walk(guidePresentationDir).filter(
    (file) =>
      !allowlistedGatewayConsumers.includes(file) &&
      !guidePlayerSeam.includes(file),
  );

  // Every core module: all of the data/domain layers, the whole dictionary and
  // pattern presentation surfaces, and the walked saved-guide surface.
  const coreModules: readonly string[] = [
    ...walk(path.join(repoRoot, 'src/data')),
    ...walk(path.join(repoRoot, 'src/domain')),
    ...walk(path.join(repoRoot, 'src/features/dictionary/presentation')),
    ...walk(path.join(repoRoot, 'src/features/patterns/presentation')),
    ...guideCoreModules,
  ].filter((entry) => !GUARD_EXCLUSIONS.includes(entry));

  it('scans a non-trivial set of core modules', () => {
    // A regression that emptied the walk would make the guard vacuously pass.
    expect(coreModules.length).toBeGreaterThan(20);
  });

  it('keeps the guide-seam exclusions live (no stale/renamed entry)', () => {
    // The scan defaults to network-free, so a file is only skipped by being on
    // an explicit exclusion list. If a seam/allowlist file is renamed, its stale
    // entry must surface here rather than silently exempting the new path.
    const present = new Set(walk(guidePresentationDir));
    const stale = [...allowlistedGatewayConsumers, ...guidePlayerSeam].filter(
      (file) => !present.has(file),
    );

    expect(stale).toStrictEqual([]);
  });

  it('references no network seam from any core module', () => {
    const offenders = coreModules.filter((file) => {
      const source = readFileSync(file, 'utf8');

      return NETWORK_TOKENS.some((token) => token.test(source));
    });

    expect(offenders).toStrictEqual([]);
  });

  it('confirms the allowlisted feature files DO reference the gateway', () => {
    for (const file of allowlistedGatewayConsumers) {
      const source = readFileSync(file, 'utf8');

      expect(source).toMatch(/useGuideMetadataGateway/);
    }
  });
});

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function tree(repositories: Repositories) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <DictionaryScreen />
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

describe('DictionaryScreen paints offline', () => {
  let database: TestDatabase;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(() => {
      throw new Error(NETWORK_ERROR);
    }) as unknown as typeof globalThis.fetch;

    database = createTestDatabase();
    applyBundledStitchSeed(database.repositories.stitches);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    globalThis.fetch = originalFetch;
    database.close();
  });

  it('reaches loaded content with the network stubbed to throw', async () => {
    await render(tree(database.repositories));

    expect(screen.getByRole('header', { name: 'Stitches' })).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Single crochet, sc, Beginner'),
    ).toBeOnTheScreen();
  });
});
