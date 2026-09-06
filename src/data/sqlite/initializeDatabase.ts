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

    const withoutForeignKeys = migration.foreignKeys === 'off';

    if (withoutForeignKeys) {
      // Step 1 of SQLite's table-rebuild procedure. The pragma is a no-op inside
      // a transaction, so this must run before BEGIN — and it must be read back:
      // a silently ignored disable would let the rebuild DROP a referenced table
      // with enforcement still on, which deletes the maker's progress rows and
      // raises nothing at all.
      connection.execute('PRAGMA foreign_keys = OFF');
      if (
        connection.first<{ foreign_keys: number }>('PRAGMA foreign_keys')
          ?.foreign_keys !== 0
      ) {
        throw new DatabaseError('migration-failed', {
          schemaVersion,
          failedVersion: migration.version,
          cause: new Error(
            'Foreign-key enforcement could not be disabled for a table rebuild.',
          ),
        });
      }
    }

    let failure: unknown;
    try {
      inTransaction(() => {
        for (const statement of migration.statements) {
          connection.execute(statement);
        }

        if (withoutForeignKeys) {
          // Step 10. `foreign_key_check` returns rows rather than throwing, so
          // it cannot live in `statements` (those go through `execute`, which
          // discards results) — a silent no-op is exactly the defect this guard
          // exists to catch.
          const violations = connection.all<{ readonly table: string }>(
            'PRAGMA foreign_key_check',
          );
          if (violations.length > 0) {
            throw new Error(
              `A table rebuild left ${violations.length} foreign-key violation(s).`,
            );
          }
        }

        // The single non-parameterized statement in the codebase. `PRAGMA` does
        // not accept placeholders; the value is a validated integer constant
        // from this module and never maker input.
        connection.execute(`PRAGMA user_version = ${migration.version}`);
      });
    } catch (cause) {
      failure = cause;
    }

    if (withoutForeignKeys) {
      // Step 12, on the success path and the failure path alike. A connection
      // left with enforcement off is a worse condition than a failed migration,
      // so it is reported in preference to `failure`. Deliberately not a
      // `finally` that throws, which would mask the migration's own cause.
      connection.execute('PRAGMA foreign_keys = ON');
      if (
        connection.first<{ foreign_keys: number }>('PRAGMA foreign_keys')
          ?.foreign_keys !== 1
      ) {
        throw new DatabaseError('foreign-keys-unavailable');
      }
    }

    if (failure !== undefined) {
      throw new DatabaseError('migration-failed', {
        schemaVersion,
        failedVersion: migration.version,
        cause: failure,
      });
    }

    schemaVersion = migration.version;
    appliedMigrations.push(migration.version);
  }

  return { schemaVersion, appliedMigrations };
}
