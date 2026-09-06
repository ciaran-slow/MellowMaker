/** @jest-environment node */

import { DatabaseError } from '@/data/contracts/databaseError';
import { createAppDatabase } from '@/platform/database/createAppDatabase';
import {
  DATABASE_NAME,
  openExpoSqliteConnection,
} from '@/platform/database/expoSqliteConnection';

import { failDatabaseOpen, openDatabaseNames } from './support/expoSqliteMock';

describe('Expo SQLite adapter', () => {
  it('opens the application database, migrates it, and serves repositories', async () => {
    const database = await createAppDatabase();

    expect(database.schemaVersion).toBe(3);

    const created = database.repositories.patterns.createPattern({
      title: 'Sunrise Blanket',
      notes: 'Hook 5.0 mm',
      steps: ['Chain 41', 'Single crochet across'],
    });

    expect(created.steps.map((step) => step.instruction)).toStrictEqual([
      'Chain 41',
      'Single crochet across',
    ]);
    expect(created.pattern.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    // Reopening the same database applies no migration and reads the row back.
    const reopened = await createAppDatabase();

    expect(reopened.schemaVersion).toBe(3);
    expect(
      reopened.repositories.patterns
        .getPatternWithSteps(created.pattern.id)
        ?.steps.map((step) => step.instruction),
    ).toStrictEqual(['Chain 41', 'Single crochet across']);
  });

  it('carries the named CHECK through to a typed empty-instruction refusal', async () => {
    const database = await createAppDatabase();

    // Through the `expo-sqlite` seam rather than the raw harness connection.
    // The constraint name reaches the mapper inside the engine's message, which
    // is why the mapper matches with `includes` rather than equality: a native
    // build may prefix it.
    await expect(
      (async () =>
        database.repositories.patterns.createPattern({
          title: 'Sunrise Blanket',
          steps: ['Chain 41', '   '],
        }))(),
    ).rejects.toMatchObject({ code: 'empty-step-instruction' });

    const raw = (() => {
      try {
        openExpoSqliteConnection().run(
          "INSERT INTO pattern_step (id, pattern_id, position, instruction, created_at, updated_at) VALUES ('s', 'p', 0, '', 1, 1)",
        );
      } catch (error) {
        return error as Error;
      }

      throw new Error('Expected the direct insert to fail.');
    })();

    expect(raw.message).toContain('pattern_step_instruction_not_empty');
    // Nothing partial survived the refused create: only the six bundled
    // starters the composition seeds are in the library.
    expect(
      database.repositories.patterns
        .listPatterns({ limit: 200, offset: 0 })
        .map((pattern) => pattern.origin),
    ).toStrictEqual(Array<string>(6).fill('bundled'));
  });

  it('reports an absent row as undefined rather than null', async () => {
    const database = await createAppDatabase();

    expect(
      database.repositories.patterns.getPatternWithSteps('missing-pattern'),
    ).toBeUndefined();
    expect(
      database.repositories.stitches.getStitchDetail('missing-stitch'),
    ).toBeUndefined();
    expect(
      database.repositories.guides.findGuideByVideoId('missing-video'),
    ).toBeUndefined();
  });

  it('seeds the bundled catalog through the production composition and not again on reopen', async () => {
    const database = await createAppDatabase();

    // The browse order the catalog reads in, written out here so a composition
    // that never ran the loader fails instead of reporting an empty catalog.
    expect(
      database.repositories.stitches
        .listStitches({ limit: 200, offset: 0 })
        .map((stitch) => stitch.slug),
    ).toStrictEqual([
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
    ]);

    const seeded = database.repositories.stitches
      .listStitches({ limit: 200, offset: 0 })
      .map((stitch) =>
        database.repositories.stitches.getStitchDetail(stitch.id)?.updatedAt,
      );

    const reopened = await createAppDatabase();
    const catalog = reopened.repositories.stitches.listStitches({
      limit: 200,
      offset: 0,
    });

    expect(catalog).toHaveLength(12);
    expect(
      catalog.map(
        (stitch) =>
          reopened.repositories.stitches.getStitchDetail(stitch.id)?.updatedAt,
      ),
    ).toStrictEqual(seeded);
  });

  it('turns a native open failure into a recoverable database error', async () => {
    failDatabaseOpen(new Error('unable to open database file'));

    await expect(createAppDatabase()).rejects.toThrow(DatabaseError);
    await expect(createAppDatabase()).rejects.toMatchObject({
      code: 'open-failed',
    });
    expect(() => openExpoSqliteConnection(DATABASE_NAME)).toThrow(
      expect.objectContaining({ code: 'open-failed' }),
    );
  });

  it('releases the handle when migration fails so a retry can reopen the file', async () => {
    // A schema newer than this build knows how to read, recorded on the handle
    // the adapter will reuse: initialization fails after the database is open.
    openExpoSqliteConnection().execute('PRAGMA user_version = 999');

    await expect(createAppDatabase()).rejects.toMatchObject({
      code: 'unsupported-schema-version',
    });
    expect(openDatabaseNames()).toStrictEqual([]);
  });
});
