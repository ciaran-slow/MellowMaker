import type { Repositories } from '../contracts/appDatabase';
import { createCounterRepository } from './createCounterRepository';
import { createGuideRepository } from './createGuideRepository';
import { createPatternRepository } from './createPatternRepository';
import { createProgressRepository } from './createProgressRepository';
import { createStitchRepository } from './createStitchRepository';
import type { RepositoryContext } from './repositoryContext';
import type { SqliteConnection } from './sqliteConnection';
import { createTransactionRunner } from './transaction';

export interface CreateRepositoriesOptions {
  readonly connection: SqliteConnection;
  /** Milliseconds since the Unix epoch, UTC. */
  readonly now: () => number;
  readonly newId: () => string;
}

/**
 * Builds every repository over one connection and one transaction runner, so a
 * read-modify-write cannot interleave with another repository's write.
 */
export function createRepositories({
  connection,
  now,
  newId,
}: CreateRepositoriesOptions): Repositories {
  const context: RepositoryContext = {
    connection,
    transaction: createTransactionRunner(connection),
    now,
    newId,
  };

  return {
    stitches: createStitchRepository(context),
    patterns: createPatternRepository(context),
    progress: createProgressRepository(context),
    counters: createCounterRepository(context),
    guides: createGuideRepository(context),
  };
}
