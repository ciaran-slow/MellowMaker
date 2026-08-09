/** @jest-environment node */

import { DatabaseError } from '@/data/contracts/databaseError';
import type { SeedStitchInput } from '@/data/contracts/stitchRepository';
import {
  applyBundledStitchSeed,
  applyStitchSeed,
  bundledStitchSeed,
} from '@/data/seed/stitchSeed';
import {
  parseStitchSeedDocument,
  StitchSeedError,
  type StitchSeedDocument,
} from '@/data/seed/stitchSeedDocument';

import { BASELINE, insertPopulatedBaseline } from './support/populatedBaseline';
import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

const WHOLE_CATALOG = { limit: 200, offset: 0 } as const;

/**
 * The browse order the catalog reads in: `search_text ASC, id ASC`. Written by
 * hand and deliberately different from the pedagogical document order, so an
 * implementation that leaked authoring order into reads fails.
 */
const BROWSE_ORDER: readonly string[] = [
  'back-loop-only',
  'chain',
  'double-crochet',
  'double-crochet-two-together',
  'fasten-off',
  'half-double-crochet',
  'magic-ring',
  'single-crochet-increase',
  'single-crochet',
  'single-crochet-two-together',
  'slip-stitch',
  'treble-crochet',
];

const BUNDLED_INSTRUCTION_TOTAL = 62;

function instructionCount(database: TestDatabase): number {
  return (
    database.connection.first<{ readonly total: number }>(
      'SELECT COUNT(*) AS total FROM stitch_instruction',
    )?.total ?? -1
  );
}

function seededStitchId(database: TestDatabase, slug: string): string {
  const found = database.repositories.stitches
    .listStitches(WHOLE_CATALOG)
    .find((stitch) => stitch.slug === slug);
  if (found === undefined) {
    throw new Error(`No stitch is bundled under the slug "${slug}".`);
  }

  return found.id;
}

/** A content release built here, so the committed document stays the v1 fixture. */
function revisedRelease(document: StitchSeedDocument): StitchSeedDocument {
  const revised: SeedStitchInput[] = document.stitches.map((stitch) => ({
    ...stitch,
    summary: `Revised wording for ${stitch.slug}`,
    instructions: [{ instruction: `Revised single step for ${stitch.slug}` }],
  }));

  return {
    seedVersion: 2,
    terminology: 'US',
    stitches: [
      ...revised,
      {
        slug: 'front-loop-only',
        name: 'Front loop only',
        abbreviation: 'FLO',
        difficulty: 'intermediate',
        summary: 'Work under the front loop alone to leave a ridge on the back.',
        instructions: [{ instruction: 'Insert the hook under the front loop.' }],
      },
    ],
  };
}

describe('bundled stitch seed loader', () => {
  let database: TestDatabase;
  let document: StitchSeedDocument;

  beforeEach(() => {
    database = createTestDatabase();
    document = bundledStitchSeed();
  });

  afterEach(() => {
    database.close();
  });

  it('applies the bundled set to a fresh install', () => {
    expect(applyBundledStitchSeed(database.repositories.stitches)).toStrictEqual(
      {
        status: 'applied',
        seedVersion: 1,
        inserted: 12,
        updated: 0,
        skipped: 0,
      },
    );

    const catalog = database.repositories.stitches.listStitches(WHOLE_CATALOG);

    expect(catalog).toHaveLength(12);
    for (const stitch of catalog) {
      expect(stitch.ownership).toBe('seed');
      expect(stitch.slug).not.toBeUndefined();
    }
    expect(instructionCount(database)).toBe(BUNDLED_INSTRUCTION_TOTAL);
  });

  it('reads the catalog in browse order rather than document order', () => {
    applyBundledStitchSeed(database.repositories.stitches);

    expect(
      database.repositories.stitches
        .listStitches(WHOLE_CATALOG)
        .map((stitch) => stitch.slug),
    ).toStrictEqual(BROWSE_ORDER);
    expect(document.stitches.map((stitch) => stitch.slug)).not.toStrictEqual(
      BROWSE_ORDER,
    );
  });

  it('round-trips instruction order into contiguous positions', () => {
    applyBundledStitchSeed(database.repositories.stitches);

    for (const slug of ['chain', 'half-double-crochet']) {
      const committed = document.stitches.find(
        (stitch) => stitch.slug === slug,
      );
      const detail = database.repositories.stitches.getStitchDetail(
        seededStitchId(database, slug),
      );

      expect(detail?.instructions.map((step) => step.position)).toStrictEqual(
        committed?.instructions.map((_step, index) => index),
      );
      expect(detail?.instructions.map((step) => step.instruction)).toStrictEqual(
        committed?.instructions.map((step) => step.instruction),
      );
    }
  });

  it('performs no write when the applied version already covers the release', () => {
    applyBundledStitchSeed(database.repositories.stitches);

    const before = database.connection.all<{
      readonly id: string;
      readonly updated_at: number;
    }>('SELECT id, updated_at FROM stitch ORDER BY id');
    const instructionsBefore = database.connection.all<{
      readonly id: string;
      readonly stitch_id: string;
      readonly position: number;
    }>('SELECT id, stitch_id, position FROM stitch_instruction ORDER BY id');

    expect(applyBundledStitchSeed(database.repositories.stitches)).toStrictEqual(
      { status: 'skipped', appliedSeedVersion: 1 },
    );
    expect(applyBundledStitchSeed(database.repositories.stitches)).toStrictEqual(
      { status: 'skipped', appliedSeedVersion: 1 },
    );

    expect(
      database.connection.all<{
        readonly id: string;
        readonly updated_at: number;
      }>('SELECT id, updated_at FROM stitch ORDER BY id'),
    ).toStrictEqual(before);
    expect(
      database.connection.all<{
        readonly id: string;
        readonly stitch_id: string;
        readonly position: number;
      }>('SELECT id, stitch_id, position FROM stitch_instruction ORDER BY id'),
    ).toStrictEqual(instructionsBefore);
    expect(instructionCount(database)).toBe(BUNDLED_INSTRUCTION_TOTAL);
  });

  it('re-imports the same release without duplicating anything when the guard is bypassed', () => {
    applyBundledStitchSeed(database.repositories.stitches);

    expect(
      database.repositories.stitches.upsertSeededStitches(1, document.stitches),
    ).toStrictEqual({ inserted: 0, updated: 12, skipped: 0 });
    expect(
      database.repositories.stitches.listStitches(WHOLE_CATALOG),
    ).toHaveLength(12);
    expect(instructionCount(database)).toBe(BUNDLED_INSTRUCTION_TOTAL);
  });

  it('applies a later release over maker data without touching a maker edit', () => {
    insertPopulatedBaseline(database.connection);
    applyBundledStitchSeed(database.repositories.stitches);

    const chainId = seededStitchId(database, 'chain');
    const committedChain = database.repositories.stitches.getStitchDetail(
      chainId,
    );

    database.connection.run(
      'UPDATE stitch SET summary = ?, user_modified_at = ? WHERE slug = ?',
      ['My own words for the chain', 1_699_000_000_000, 'chain'],
    );
    database.connection.run(
      `INSERT INTO stitch (id, slug, name, abbreviation, difficulty, summary, ownership, seed_version, user_modified_at, created_at, updated_at)
       VALUES ('stitch-maker-swirl', NULL, 'Swirl stitch', 'swrl', 'advanced', 'Mine alone', 'user', NULL, NULL, 1, 2)`,
    );

    expect(
      applyStitchSeed(database.repositories.stitches, revisedRelease(document)),
    ).toStrictEqual({
      status: 'applied',
      seedVersion: 2,
      inserted: 1,
      updated: 11,
      skipped: 1,
    });

    const edited = database.repositories.stitches.getStitchDetail(chainId);

    expect(edited?.summary).toBe('My own words for the chain');
    expect(edited?.seedVersion).toBe(1);
    expect(edited?.userModifiedAt).toBe(1_699_000_000_000);
    expect(edited?.instructions.map((step) => step.instruction)).toStrictEqual(
      committedChain?.instructions.map((step) => step.instruction),
    );

    for (const slug of BROWSE_ORDER.filter((entry) => entry !== 'chain')) {
      const detail = database.repositories.stitches.getStitchDetail(
        seededStitchId(database, slug),
      );

      expect(detail?.summary).toBe(`Revised wording for ${slug}`);
      expect(detail?.seedVersion).toBe(2);
      expect(detail?.instructions.map((step) => step.instruction)).toStrictEqual(
        [`Revised single step for ${slug}`],
      );
    }

    expect(
      database.repositories.stitches.getStitchDetail('stitch-maker-swirl'),
    ).toStrictEqual({
      id: 'stitch-maker-swirl',
      slug: undefined,
      name: 'Swirl stitch',
      abbreviation: 'swrl',
      difficulty: 'advanced',
      summary: 'Mine alone',
      ownership: 'user',
      seedVersion: undefined,
      userModifiedAt: undefined,
      createdAt: 1,
      updatedAt: 2,
      instructions: [],
    });

    // The maker's own patterns, progress, guide, and counter are outside the
    // seed path entirely; compare against the literal baseline.
    expect(
      database.connection
        .all<{
          readonly id: string;
          readonly title: string;
          readonly notes: string | null;
          readonly updated_at: number;
        }>('SELECT id, title, notes, updated_at FROM pattern ORDER BY id')
        .map((row) => [row.id, row.title, row.notes, row.updated_at]),
    ).toStrictEqual([
      ['pattern-hedgehog', 'Tiny Hedgehog', null, BASELINE.patterns[1]?.updatedAt],
      [
        'pattern-sunrise',
        'Sunrise Blanket',
        'Hook 5.0 mm, cotton yarn',
        BASELINE.patterns[0]?.updatedAt,
      ],
    ]);
    expect(
      database.connection
        .all<{
          readonly id: string;
          readonly position: number;
          readonly instruction: string;
        }>('SELECT id, position, instruction FROM pattern_step ORDER BY id')
        .map((row) => [row.id, row.position, row.instruction]),
    ).toStrictEqual(
      [...BASELINE.patterns[0].steps, ...BASELINE.patterns[1].steps]
        .map((step) => [step.id, step.position, step.instruction])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    );
    expect(
      database.connection
        .all<{
          readonly step_id: string;
          readonly completed_at: number;
        }>('SELECT step_id, completed_at FROM pattern_step_progress')
        .map((row) => [row.step_id, row.completed_at]),
    ).toStrictEqual([
      [BASELINE.completedStep.stepId, BASELINE.completedStep.completedAt],
    ]);
    expect(
      database.connection
        .all<{
          readonly active_step_id: string;
          readonly updated_at: number;
        }>('SELECT active_step_id, updated_at FROM pattern_progress')
        .map((row) => [row.active_step_id, row.updated_at]),
    ).toStrictEqual([
      [BASELINE.activeStep.activeStepId, BASELINE.activeStep.updatedAt],
    ]);
    expect(
      database.connection
        .all<{
          readonly video_id: string;
          readonly title: string;
          readonly updated_at: number;
        }>('SELECT video_id, title, updated_at FROM imported_guide')
        .map((row) => [row.video_id, row.title, row.updated_at]),
    ).toStrictEqual([
      [BASELINE.guide.videoId, BASELINE.guide.title, BASELINE.guide.updatedAt],
    ]);
    expect(
      database.connection
        .all<{
          readonly instruction: string;
          readonly video_offset_ms: number;
        }>('SELECT instruction, video_offset_ms FROM guide_step')
        .map((row) => [row.instruction, row.video_offset_ms]),
    ).toStrictEqual([
      [BASELINE.guide.step.instruction, BASELINE.guide.step.videoOffsetMs],
    ]);
    expect(
      database.connection
        .all<{
          readonly value: number;
          readonly updated_at: number;
        }>('SELECT value, updated_at FROM counter')
        .map((row) => [row.value, row.updated_at]),
    ).toStrictEqual([[BASELINE.counter.value, BASELINE.counter.updatedAt]]);

    expect(database.repositories.stitches.appliedSeedVersion()).toBe(2);
    expect(
      applyStitchSeed(database.repositories.stitches, revisedRelease(document)),
    ).toStrictEqual({ status: 'skipped', appliedSeedVersion: 2 });
  });

  it('refuses to let an older release rewrite newer content', () => {
    applyBundledStitchSeed(database.repositories.stitches);
    applyStitchSeed(database.repositories.stitches, revisedRelease(document));

    expect(
      applyStitchSeed(database.repositories.stitches, document),
    ).toStrictEqual({ status: 'skipped', appliedSeedVersion: 2 });
    expect(
      database.repositories.stitches.getStitchDetail(
        seededStitchId(database, 'chain'),
      )?.summary,
    ).toBe('Revised wording for chain');
    expect(database.repositories.stitches.appliedSeedVersion()).toBe(2);
  });

  it('treats an unseeded database as behind every release', () => {
    expect(database.repositories.stitches.appliedSeedVersion()).toBeUndefined();
    expect(
      applyStitchSeed(database.repositories.stitches, document).status,
    ).toBe('applied');
  });

  it('surfaces invalid content as a StitchSeedError that is not a database failure', () => {
    const result = parseStitchSeedDocument({
      seedVersion: 1,
      terminology: 'US',
      stitches: [
        {
          slug: 'chain',
          name: 'Chain',
          abbreviation: 'ch',
          difficulty: 'beginner',
          summary: 'A summary long enough to satisfy the length rule.',
          instructions: [{ instruction: 'TODO: write the chain steps' }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    const error = new StitchSeedError(result.issues);

    expect(error).toBeInstanceOf(StitchSeedError);
    expect(error).not.toBeInstanceOf(DatabaseError);
    expect(error.issues.map((issue) => issue.path)).toStrictEqual([
      'stitches[0].instructions',
      'stitches[0].instructions[0].instruction',
    ]);
    expect(error.message).not.toContain('write the chain steps');
  });
});
