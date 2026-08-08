import type { SqliteConnection } from './sqliteConnection';
import type { TransactionRunner } from './transaction';

/**
 * Everything a repository needs. The clock and the identifier generator are
 * injected so `src/data` never imports Expo and tests stay deterministic.
 */
export interface RepositoryContext {
  readonly connection: SqliteConnection;
  readonly transaction: TransactionRunner;
  /** Milliseconds since the Unix epoch, UTC. */
  readonly now: () => number;
  readonly newId: () => string;
}
