import type { SqliteConnection } from './sqliteConnection';

export type TransactionRunner = <Result>(work: () => Result) => Result;

/**
 * Rolls back without masking the failure that caused it.
 *
 * Some SQLite errors abort the active transaction themselves, which makes an
 * explicit `ROLLBACK` fail with "no transaction is active". The original error
 * is always the actionable one, so a failing rollback is not re-thrown over it.
 */
function rollbackQuietly(connection: SqliteConnection, sql: string): void {
  try {
    connection.execute(sql);
  } catch {
    // Intentionally ignored; the caller re-throws the originating error.
  }
}

/**
 * Builds a transaction runner for one connection.
 *
 * The outermost call uses `BEGIN IMMEDIATE` so write intent is taken up front
 * rather than upgraded mid-transaction. Nested calls use savepoints so one
 * repository method can compose another without SQLite rejecting a nested
 * `BEGIN`. Depth lives in this closure, never in module state, so two
 * connections cannot corrupt each other's nesting.
 */
export function createTransactionRunner(
  connection: SqliteConnection,
): TransactionRunner {
  let depth = 0;

  return <Result>(work: () => Result): Result => {
    const outerDepth = depth;
    const savepoint =
      outerDepth === 0 ? null : `mellowmaker_savepoint_${outerDepth}`;

    connection.execute(
      savepoint === null ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`,
    );
    depth = outerDepth + 1;

    let result: Result;
    try {
      result = work();
    } catch (error) {
      depth = outerDepth;
      rollbackQuietly(
        connection,
        savepoint === null
          ? 'ROLLBACK'
          : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`,
      );
      throw error;
    }

    depth = outerDepth;
    connection.execute(
      savepoint === null ? 'COMMIT' : `RELEASE ${savepoint}`,
    );

    return result;
  };
}
