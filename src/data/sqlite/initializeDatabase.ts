import { DatabaseError } from '../contracts/databaseError';
import { MIGRATIONS, type Migration } from './migrations';
import type { SqliteConnection } from './sqliteConnection';
import { createTransactionRunner } from './transaction';

export interface InitializeDatabaseOptions {
  /** Overridden only by migration tests; production always uses {@link MIGRATIONS}. */
  readonly migrations?: readonly Migration[];
}

export interface InitializeDatabaseResult {
  readonly schemaVersion: number;
  readonly appliedMigrations: readonly number[];
}

/**
 * Brings an open connection up to the latest schema version.
 *
 * There is no `DROP`, no delete-and-recreate, and no reset path: SQLite keeps
 * both DDL and `PRAGMA user_version` inside the transaction, so a failed
 * migration leaves the schema, the rows, and the recorded version exactly as
 * they were. Re-running after a failure is therefore safe and idempotent.
 */
export function initializeDatabase(
  connection: SqliteConnection,
  options: InitializeDatabaseOptions = {},
): InitializeDatabaseResult {
  // Enforcement must be enabled outside a transaction; the pragma is a no-op
  // inside one. Reading it back proves the engine honoured it.
  connection.execute('PRAGMA foreign_keys = ON');
  const enforcement = connection.first<{ foreign_keys: number }>(
    'PRAGMA foreign_keys',
  );
  if (enforcement?.foreign_keys !== 1) {
    throw new DatabaseError('foreign-keys-unavailable');
  }

  const migrations = [...(options.migrations ?? MIGRATIONS)].sort(
    (left, right) => left.version - right.version,
  );
  const supportedVersion = migrations.reduce(
    (highest, migration) => Math.max(highest, migration.version),
    0,
  );

  const versionRow = connection.first<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const startingVersion = versionRow?.user_version ?? 0;

  if (startingVersion > supportedVersion) {
    // A downgraded app must never rewrite a database a newer app created.
    throw new DatabaseError('unsupported-schema-version', {
      schemaVersion: startingVersion,
    });
  }

  const inTransaction = createTransactionRunner(connection);
  const appliedMigrations: number[] = [];
  let schemaVersion = startingVersion;

  for (const migration of migrations) {
    if (migration.version <= schemaVersion) {
      continue;
    }

    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new DatabaseError('migration-failed', {
        schemaVersion,
        failedVersion: migration.version,
        cause: new Error(
          'A migration version must be a positive integer because pragmas cannot be parameterized.',
        ),
      });
    }

    try {
      inTransaction(() => {
        for (const statement of migration.statements) {
          connection.execute(statement);
        }
        // The single non-parameterized statement in the codebase. `PRAGMA` does
        // not accept placeholders; the value is a validated integer constant
        // from this module and never maker input.
        connection.execute(`PRAGMA user_version = ${migration.version}`);
      });
    } catch (cause) {
      throw new DatabaseError('migration-failed', {
        schemaVersion,
        failedVersion: migration.version,
        cause,
      });
    }

    schemaVersion = migration.version;
    appliedMigrations.push(migration.version);
  }

  return { schemaVersion, appliedMigrations };
}
