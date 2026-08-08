import { DatabaseSync } from 'node:sqlite';

import type { Repositories } from '@/data/contracts/appDatabase';
import { createRepositories } from '@/data/sqlite/createRepositories';
import {
  initializeDatabase,
  type InitializeDatabaseOptions,
} from '@/data/sqlite/initializeDatabase';
import type {
  SqliteConnection,
  SqlValue,
} from '@/data/sqlite/sqliteConnection';

/**
 * A `node:sqlite` connection behind the production connection boundary, so
 * integration tests execute the same SQL and migration inputs as the Expo
 * adapter instead of a second schema.
 *
 * Foreign keys start disabled — `node:sqlite` enables them by default, which
 * would let these tests pass even if the initializer never enabled enforcement.
 */
export function createNodeSqliteConnection(): SqliteConnection {
  const database = new DatabaseSync(':memory:', {
    enableForeignKeyConstraints: false,
  });

  return {
    execute(sql) {
      database.exec(sql);
    },
    run(sql, params = []) {
      database.prepare(sql).run(...(params as SqlValue[]));
    },
    all<Row>(sql: string, params: readonly SqlValue[] = []) {
      return database.prepare(sql).all(...(params as SqlValue[])) as Row[];
    },
    first<Row>(sql: string, params: readonly SqlValue[] = []) {
      return database.prepare(sql).get(...(params as SqlValue[])) as
        | Row
        | undefined;
    },
    close() {
      database.close();
    },
  };
}

export interface TestDatabase {
  readonly connection: SqliteConnection;
  readonly repositories: Repositories;
  readonly schemaVersion: number;
  readonly appliedMigrations: readonly number[];
  /** The same injected clock the repositories use; each call advances one second. */
  readonly now: () => number;
  readonly newId: () => string;
  close(): void;
}

export interface TestDatabaseOptions extends InitializeDatabaseOptions {
  /** First instant the injected clock returns, in epoch milliseconds. */
  readonly startAt?: number;
}

const FIRST_TEST_INSTANT = 1_700_000_000_000;

/**
 * Opens an in-memory database, runs the production initializer, and builds the
 * production repositories over a deterministic clock and identifier sequence.
 */
export function createTestDatabase(
  options: TestDatabaseOptions = {},
): TestDatabase {
  const connection = createNodeSqliteConnection();
  let instant = options.startAt ?? FIRST_TEST_INSTANT;
  let identifiers = 0;

  const now = () => {
    instant += 1_000;

    return instant;
  };
  const newId = () => {
    identifiers += 1;

    return `test-id-${identifiers}`;
  };

  const { schemaVersion, appliedMigrations } = initializeDatabase(
    connection,
    options.migrations === undefined ? {} : { migrations: options.migrations },
  );

  return {
    connection,
    repositories: createRepositories({ connection, now, newId }),
    schemaVersion,
    appliedMigrations,
    now,
    newId,
    close: () => {
      connection.close();
    },
  };
}
