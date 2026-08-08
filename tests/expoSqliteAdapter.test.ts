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

    expect(database.schemaVersion).toBe(1);

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

    expect(reopened.schemaVersion).toBe(1);
    expect(
      reopened.repositories.patterns
        .getPatternWithSteps(created.pattern.id)
        ?.steps.map((step) => step.instruction),
    ).toStrictEqual(['Chain 41', 'Single crochet across']);
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
