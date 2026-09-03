/** @jest-environment node */

import { DatabaseError } from '@/data/contracts/databaseError';
import type { SeedPatternInput } from '@/data/contracts/patternRepository';
import {
  applyBundledPatternSeed,
  applyPatternSeed,
  bundledPatternSeed,
} from '@/data/seed/patternSeed';
import {
  parsePatternSeedDocument,
  PatternSeedError,
  type PatternSeedDocument,
} from '@/data/seed/patternSeedDocument';

import { BASELINE, insertPopulatedBaseline } from './support/populatedBaseline';
import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

const WHOLE_LIBRARY = { limit: 200, offset: 0 } as const;

/** Hand-written: the fresh-install library order, which is document order. */
const EXPECTED_LIBRARY_ORDER: readonly string[] = [
  'Practice Swatch',
  'Cotton Dishcloth',
  'Ridged Coaster',
  'Granny Square',
  'Ribbed Headband',
  'Simple Scarf',
];

const TOTAL_STEPS = 38;

interface LedgerRow {
  readonly slug: string;
  readonly pattern_id: string | null;
  readonly seed_version: number;
  readonly seeded_at: number;
}

function ledger(database: TestDatabase): LedgerRow[] {
  return database.connection.all<LedgerRow>(
    'SELECT slug, pattern_id, seed_version, seeded_at FROM pattern_seed_state ORDER BY slug ASC',
  );
}

function stepCount(database: TestDatabase): number {
  return (
    database.connection.first<{ readonly total: number }>(
      'SELECT COUNT(*) AS total FROM pattern_step',
    )?.total ?? -1
  );
}

function seededPatternId(database: TestDatabase, slug: string): string {
  const row = database.connection.first<{ readonly pattern_id: string | null }>(
    'SELECT pattern_id FROM pattern_seed_state WHERE slug = ?',
    [slug],
  );
  if (row?.pattern_id === undefined || row.pattern_id === null) {
    throw new Error(`No live bundled pattern is recorded under "${slug}".`);
  }

  return row.pattern_id;
}

/**
 * A later release built here, so the committed document stays the v1 fixture. It
 * repeats every shipped slug with rewritten content and adds one new slug: an
 * insert-only seed must take the new slug and leave all six repeats alone.
 */
function laterRelease(document: PatternSeedDocument): PatternSeedDocument {
  const revised: SeedPatternInput[] = document.patterns.map((pattern) => ({
    ...pattern,
    title: `Revised ${pattern.title}`,
    notes: `Hook 9.0 mm · Revised notes for ${pattern.slug} · Finishes differently`,
    steps: [
      `Revised first step for ${pattern.slug}, rewritten by a later release.`,
      `Revised second step for ${pattern.slug}, rewritten by a later release.`,
      `Revised third step for ${pattern.slug}, rewritten by a later release.`,
      `Revised fourth step for ${pattern.slug}, rewritten by a later release.`,
    ],
  }));

  return {
    seedVersion: 2,
    terminology: 'US',
    patterns: [
      ...revised,
      {
        slug: 'chevron-cowl',
        title: 'Chevron Cowl',
        notes: 'Hook 5.5 mm · Worsted (medium 4) yarn · Finishes about 60 cm around',
        steps: [
          'Chain 90 and join with a slip stitch, taking care not to twist it.',
          'Work one round of double crochet into every stitch around.',
          'Repeat the round until the cowl is as deep as you like it.',
          'Fasten off and weave the ends into the inside of the cowl.',
        ],
      },
    ],
  };
}

describe('bundled pattern seed loader', () => {
  let database: TestDatabase;
  let document: PatternSeedDocument;

  beforeEach(() => {
    database = createTestDatabase();
    document = bundledPatternSeed();
  });

  afterEach(() => {
    database.close();
  });

  it('applies the bundled set to a fresh install', () => {
    expect(applyBundledPatternSeed(database.repositories.patterns)).toStrictEqual(
      { status: 'applied', seedVersion: 1, inserted: 6, skipped: 0 },
    );

    const library = database.repositories.patterns.listPatterns(WHOLE_LIBRARY);

    expect(library).toHaveLength(6);
    for (const pattern of library) {
      expect(pattern.origin).toBe('bundled');
      expect(pattern.notes).not.toBeUndefined();
    }
    expect(stepCount(database)).toBe(TOTAL_STEPS);

    const rows = ledger(database);
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.pattern_id).not.toBeNull();
      expect(row.seed_version).toBe(1);
    }
    expect(rows.map((row) => row.slug).sort()).toStrictEqual(
      document.patterns.map((pattern) => pattern.slug).sort(),
    );
  });

  it('reads in the documented library order', () => {
    applyBundledPatternSeed(database.repositories.patterns);

    const library = database.repositories.patterns.listPatterns(WHOLE_LIBRARY);

    // The harness clock advances 1000 ms per `now()` call, so an implementation
    // that stamped each insert with its own `now()` would produce ascending
    // instants and hand back a reversed library.
    expect(library.map((pattern) => pattern.title)).toStrictEqual(
      EXPECTED_LIBRARY_ORDER,
    );

    const instants = library.map((pattern) => pattern.updatedAt);
    expect(new Set(instants).size).toBe(6);
    for (let index = 1; index < instants.length; index += 1) {
      expect(instants[index - 1]).toBeGreaterThan(instants[index] as number);
    }
    // Created and updated agree, so nothing has been "touched" since seeding.
    expect(library.map((pattern) => pattern.createdAt)).toStrictEqual(instants);
  });

  it('round-trips step order into contiguous positions', () => {
    applyBundledPatternSeed(database.repositories.patterns);

    for (const slug of ['granny-square', 'simple-scarf']) {
      const committed = document.patterns.find(
        (pattern) => pattern.slug === slug,
      );
      const stored = database.repositories.patterns.getPatternWithSteps(
        seededPatternId(database, slug),
      );

      expect(stored?.steps.map((step) => step.position)).toStrictEqual(
        committed?.steps.map((_step, index) => index),
      );
      expect(stored?.steps.map((step) => step.instruction)).toStrictEqual([
        ...(committed?.steps ?? []),
      ]);
    }
  });

  it('performs no write when the applied version already covers the release', () => {
    applyBundledPatternSeed(database.repositories.patterns);

    const patternsBefore = database.connection.all(
      'SELECT id, updated_at FROM pattern ORDER BY id',
    );
    const stepsBefore = database.connection.all(
      'SELECT id, pattern_id, position FROM pattern_step ORDER BY id',
    );
    const ledgerBefore = ledger(database);

    expect(applyBundledPatternSeed(database.repositories.patterns)).toStrictEqual(
      { status: 'skipped', appliedSeedVersion: 1 },
    );
    expect(applyBundledPatternSeed(database.repositories.patterns)).toStrictEqual(
      { status: 'skipped', appliedSeedVersion: 1 },
    );

    expect(
      database.connection.all('SELECT id, updated_at FROM pattern ORDER BY id'),
    ).toStrictEqual(patternsBefore);
    expect(
      database.connection.all(
        'SELECT id, pattern_id, position FROM pattern_step ORDER BY id',
      ),
    ).toStrictEqual(stepsBefore);
    expect(ledger(database)).toStrictEqual(ledgerBefore);
    expect(stepCount(database)).toBe(TOTAL_STEPS);
  });

  it('never resurrects a pattern the maker deleted, with the version guard bypassed', () => {
    applyBundledPatternSeed(database.repositories.patterns);
    const dishclothId = seededPatternId(database, 'cotton-dishcloth');

    database.repositories.patterns.deletePattern(dishclothId);

    // Bypasses `applyPatternSeed` entirely, so the version guard cannot be what
    // makes this pass: the ledger check inside the repository is the mechanism.
    expect(
      database.repositories.patterns.insertSeededPatterns(1, document.patterns),
    ).toStrictEqual({ inserted: 0, skipped: 6 });

    const library = database.repositories.patterns.listPatterns(WHOLE_LIBRARY);
    expect(library).toHaveLength(5);
    expect(library.map((pattern) => pattern.title)).not.toContain(
      'Cotton Dishcloth',
    );

    const tombstone = ledger(database).find(
      (row) => row.slug === 'cotton-dishcloth',
    );
    expect(tombstone).toBeDefined();
    expect(tombstone?.pattern_id).toBeNull();
  });

  it('never resurrects it across a version bump either', () => {
    applyBundledPatternSeed(database.repositories.patterns);
    database.repositories.patterns.deletePattern(
      seededPatternId(database, 'cotton-dishcloth'),
    );

    expect(
      applyPatternSeed(database.repositories.patterns, laterRelease(document)),
    ).toStrictEqual({
      status: 'applied',
      seedVersion: 2,
      inserted: 1,
      skipped: 6,
    });

    const library = database.repositories.patterns.listPatterns(WHOLE_LIBRARY);
    expect(library).toHaveLength(6);
    expect(library.map((pattern) => pattern.title)).not.toContain(
      'Cotton Dishcloth',
    );
    expect(library.map((pattern) => pattern.title)).toContain('Chevron Cowl');

    const rows = ledger(database);
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.seed_version).toBe(2);
    }
    expect(
      rows.find((row) => row.slug === 'cotton-dishcloth')?.pattern_id,
    ).toBeNull();
    expect(database.repositories.patterns.appliedPatternSeedVersion()).toBe(2);
  });

  it('never rewrites a bundled pattern the maker made their own', () => {
    applyBundledPatternSeed(database.repositories.patterns);
    const { patterns, progress } = database.repositories;
    const scarfId = seededPatternId(database, 'simple-scarf');
    const originalSteps =
      patterns.getPatternWithSteps(scarfId)?.steps.map((step) => step.id) ?? [];

    patterns.updatePattern({ id: scarfId, title: 'My Winter Scarf' });
    patterns.reorderSteps(scarfId, [
      originalSteps[5] as string,
      ...originalSteps.slice(0, 5),
    ]);
    progress.setStepCompleted(originalSteps[0] as string, true);

    const makerOrder =
      patterns.getPatternWithSteps(scarfId)?.steps.map((step) => step.id) ?? [];

    expect(
      applyPatternSeed(patterns, laterRelease(document)),
    ).toStrictEqual({
      status: 'applied',
      seedVersion: 2,
      inserted: 1,
      skipped: 6,
    });

    const after = patterns.getPatternWithSteps(scarfId);
    expect(after?.pattern.title).toBe('My Winter Scarf');
    expect(after?.pattern.origin).toBe('bundled');
    expect(after?.steps.map((step) => step.id)).toStrictEqual(makerOrder);
    expect(
      after?.steps.some((step) => step.instruction.startsWith('Revised')),
    ).toBe(false);
    expect(progress.getProgress(scarfId).completedStepIds).toStrictEqual([
      originalSteps[0],
    ]);

    // Exactly one live row still carries the slug: no duplicate was inserted
    // beside the maker's copy.
    expect(
      ledger(database).filter((row) => row.slug === 'simple-scarf'),
    ).toHaveLength(1);
    expect(seededPatternId(database, 'simple-scarf')).toBe(scarfId);
    expect(
      patterns
        .listPatterns(WHOLE_LIBRARY)
        .filter((pattern) => pattern.title === 'My Winter Scarf'),
    ).toHaveLength(1);
  });

  it('sorts bundled patterns below the work a maker already has', () => {
    insertPopulatedBaseline(database.connection);

    applyBundledPatternSeed(database.repositories.patterns);

    const library = database.repositories.patterns.listPatterns(WHOLE_LIBRARY);

    // A `now()`-anchored implementation puts the six starters on top and fails.
    expect(library.map((pattern) => pattern.title)).toStrictEqual([
      'Tiny Hedgehog',
      'Sunrise Blanket',
      ...EXPECTED_LIBRARY_ORDER,
    ]);
    for (const title of ['Tiny Hedgehog', 'Sunrise Blanket']) {
      expect(
        library.find((pattern) => pattern.title === title)?.origin,
      ).toBe('user');
    }

    // The maker's own rows are untouched, literal value for literal value.
    const sunrise = BASELINE.patterns[0];
    expect(
      database.repositories.patterns
        .getPatternWithSteps(sunrise.id)
        ?.steps.map((step) => [step.position, step.instruction]),
    ).toStrictEqual(sunrise.steps.map((step) => [step.position, step.instruction]));
    const sunriseProgress = database.repositories.progress.getProgress(
      sunrise.id,
    );
    expect(sunriseProgress.activeStepId).toBe('step-sunrise-1');
    expect(sunriseProgress.completedStepIds).toStrictEqual(['step-sunrise-0']);
    expect(
      database.connection.first<{ readonly value: number }>(
        'SELECT value FROM counter WHERE id = ?',
        [BASELINE.counter.id],
      )?.value,
    ).toBe(7);
    expect(
      database.repositories.guides.getGuideWithSteps(BASELINE.guide.id)?.guide
        .title,
    ).toBe('Granny square basics');
  });

  it('puts a pattern the maker creates afterwards at the front', () => {
    applyBundledPatternSeed(database.repositories.patterns);

    const created = database.repositories.patterns.createPattern({
      title: 'Meadow Wrap',
      steps: ['Chain 41'],
    });

    expect(created.pattern.origin).toBe('user');
    expect(
      database.repositories.patterns
        .listPatterns(WHOLE_LIBRARY)
        .map((pattern) => pattern.title),
    ).toStrictEqual(['Meadow Wrap', ...EXPECTED_LIBRARY_ORDER]);
  });

  it('treats an unledgered database as behind every release', () => {
    expect(
      database.repositories.patterns.appliedPatternSeedVersion(),
    ).toBeUndefined();
    expect(
      applyPatternSeed(database.repositories.patterns, document).status,
    ).toBe('applied');
  });

  it('refuses to let an older release rewrite newer content', () => {
    applyBundledPatternSeed(database.repositories.patterns);
    applyPatternSeed(database.repositories.patterns, laterRelease(document));

    expect(
      applyPatternSeed(database.repositories.patterns, document),
    ).toStrictEqual({ status: 'skipped', appliedSeedVersion: 2 });
    expect(
      database.repositories.patterns
        .listPatterns(WHOLE_LIBRARY)
        .map((pattern) => pattern.title),
      // The v2 release added its new slug below everything already present, and
      // the refused v1 re-application rewrote none of it.
    ).toStrictEqual([...EXPECTED_LIBRARY_ORDER, 'Chevron Cowl']);
  });

  it('surfaces invalid content as a PatternSeedError that is not a database failure', () => {
    const result = parsePatternSeedDocument({
      seedVersion: 1,
      terminology: 'US',
      patterns: [
        {
          slug: 'practice-swatch',
          title: 'Practice Swatch',
          notes: 'Hook 5.0 mm · Worsted cotton · Finishes about 12 cm square',
          steps: ['TODO: write the swatch steps'],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    const error = new PatternSeedError(result.issues);

    expect(error).toBeInstanceOf(PatternSeedError);
    expect(error).not.toBeInstanceOf(DatabaseError);
    expect(error.issues.map((issue) => issue.path)).toStrictEqual([
      'patterns[0].steps',
      'patterns[0].steps[0]',
    ]);
    expect(error.message).not.toContain('write the swatch steps');
  });

  it('throws rather than seeding when the committed document itself is invalid', () => {
    jest.isolateModules(() => {
      jest.doMock('@/data/seed/patternSeed.json', () => ({
        seedVersion: 1,
        terminology: 'US',
        patterns: [{ slug: 'practice-swatch' }],
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const seed = require('@/data/seed/patternSeed') as {
        readonly bundledPatternSeed: typeof bundledPatternSeed;
        readonly applyBundledPatternSeed: typeof applyBundledPatternSeed;
      };
      // The isolated registry holds its own copy of the format module, so the
      // error class must come from the same copy to compare by identity.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const format = require('@/data/seed/patternSeedDocument') as {
        readonly PatternSeedError: typeof PatternSeedError;
      };

      expect(() => seed.bundledPatternSeed()).toThrow(format.PatternSeedError);
      expect(() =>
        seed.applyBundledPatternSeed(database.repositories.patterns),
      ).toThrow(format.PatternSeedError);
      expect(
        database.repositories.patterns.appliedPatternSeedVersion(),
      ).toBeUndefined();
    });
  });
});
