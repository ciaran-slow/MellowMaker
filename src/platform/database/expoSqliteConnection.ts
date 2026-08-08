import * as SQLite from 'expo-sqlite';
import type { SQLiteBindValue } from 'expo-sqlite';

import { DatabaseError } from '@/data/contracts/databaseError';
import type {
  SqliteConnection,
  SqlValue,
} from '@/data/sqlite/sqliteConnection';

/**
 * One file in the application's private SQLite directory. Identical on iOS and
 * Android: same JS API, no permission, no platform branch.
 */
export const DATABASE_NAME = 'mellowmaker.db';

/**
 * Adapts `expo-sqlite`'s synchronous API to the application's connection
 * boundary. Write-ahead logging is a concern of the real database file, so it is
 * enabled here rather than in the shared initializer.
 */
export function openExpoSqliteConnection(
  databaseName: string = DATABASE_NAME,
): SqliteConnection {
  let database: SQLite.SQLiteDatabase;

  try {
    database = SQLite.openDatabaseSync(databaseName);
    database.execSync('PRAGMA journal_mode = WAL');
  } catch (cause) {
    throw new DatabaseError('open-failed', { cause });
  }

  return {
    execute(sql) {
      database.execSync(sql);
    },
    run(sql, params = []) {
      database.runSync(sql, params as SQLiteBindValue[]);
    },
    all<Row>(sql: string, params: readonly SqlValue[] = []) {
      return database.getAllSync<Row>(sql, params as SQLiteBindValue[]);
    },
    first<Row>(sql: string, params: readonly SqlValue[] = []) {
      // `getFirstSync` reports a miss as `null`; the boundary has one absent value.
      return (
        database.getFirstSync<Row>(sql, params as SQLiteBindValue[]) ?? undefined
      );
    },
    close() {
      database.closeSync();
    },
  };
}
