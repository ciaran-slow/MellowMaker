import type { SqliteConnection } from './sqliteConnection';

/**
 * Larger than any list a maker can build, so shifted rows cannot collide with
 * rows that still hold their original position.
 */
const POSITION_OFFSET = 1_000_000;

export interface ReorderStatements {
  /** `UPDATE <table> SET position = position + ? WHERE <parent>_id = ?` */
  readonly offsetPositions: string;
  /** `UPDATE <table> SET position = ?, updated_at = ? WHERE id = ? AND <parent>_id = ?` */
  readonly setPosition: string;
}

/**
 * Rewrites `position` for one parent's children in two passes.
 *
 * SQLite cannot defer a `UNIQUE (<parent>_id, position)` constraint, so writing
 * final positions directly fails as soon as two rows swap. Pass one moves every
 * affected row out of the way; pass two writes the final contiguous positions.
 * Both passes belong to the caller's transaction.
 */
export function reorderPositions(
  connection: SqliteConnection,
  statements: ReorderStatements,
  parentId: string,
  orderedIds: readonly string[],
  updatedAt: number,
): void {
  connection.run(statements.offsetPositions, [POSITION_OFFSET, parentId]);

  orderedIds.forEach((id, index) => {
    connection.run(statements.setPosition, [index, updatedAt, id, parentId]);
  });
}
