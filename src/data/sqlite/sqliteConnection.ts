/**
 * The one engine-neutral SQL surface every MellowMaker data module uses.
 *
 * It is deliberately synchronous so that the `expo-sqlite` adapter and the
 * `node:sqlite` integration harness execute identical SQL and migration inputs
 * instead of maintaining a second schema.
 *
 * `boolean` is excluded from `SqlValue` on purpose: callers map booleans to
 * `0`/`1` themselves so no engine coercion difference can leak into stored data.
 */
export type SqlValue = string | number | null | Uint8Array;

export interface SqliteConnection {
  /** Runs DDL or several statements at once. Never receives maker input. */
  execute(sql: string): void;
  run(sql: string, params?: readonly SqlValue[]): void;
  all<Row>(sql: string, params?: readonly SqlValue[]): Row[];
  first<Row>(sql: string, params?: readonly SqlValue[]): Row | undefined;
  close(): void;
}
