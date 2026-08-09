import * as Crypto from 'expo-crypto';

import type { AppDatabase } from '@/data/contracts/appDatabase';
import { applyBundledStitchSeed } from '@/data/seed/stitchSeed';
import { createRepositories } from '@/data/sqlite/createRepositories';
import { initializeDatabase } from '@/data/sqlite/initializeDatabase';
import { openExpoSqliteConnection } from '@/platform/database/expoSqliteConnection';

/**
 * The only module that knows both Expo and SQL. It opens the database, applies
 * pending migrations, imports the bundled stitch content, and hands presentation
 * a repository surface.
 *
 * Seeding runs here so `DatabaseGate`'s ready state means migrated *and*
 * seeded, and so a seed failure reuses the existing failure handling below: the
 * seed transaction has rolled back, the database file is untouched, and the gate
 * offers a retry.
 *
 * Nothing here performs a network request, so initialization behaves the same in
 * airplane mode as it does online.
 */
export async function createAppDatabase(): Promise<AppDatabase> {
  const connection = openExpoSqliteConnection();

  try {
    const { schemaVersion } = initializeDatabase(connection);
    const repositories = createRepositories({
      connection,
      now: Date.now,
      newId: Crypto.randomUUID,
    });

    applyBundledStitchSeed(repositories.stitches);

    return {
      repositories,
      schemaVersion,
      close: () => {
        connection.close();
      },
    };
  } catch (error) {
    // The database file is retained untouched; only the handle is released so a
    // retry can reopen it.
    try {
      connection.close();
    } catch {
      // Ignored: the initialization failure is the actionable one.
    }

    throw error;
  }
}
