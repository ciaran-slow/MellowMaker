import type { CounterRepository } from './counterRepository';
import type { GuideRepository } from './guideRepository';
import type { PatternRepository } from './patternRepository';
import type { ProgressRepository } from './progressRepository';
import type { StitchRepository } from './stitchRepository';

export interface Repositories {
  readonly stitches: StitchRepository;
  readonly patterns: PatternRepository;
  readonly progress: ProgressRepository;
  readonly counters: CounterRepository;
  readonly guides: GuideRepository;
}

/**
 * An opened, migrated database. Presentation code receives this and never sees
 * a connection, a statement, or SQL.
 */
export interface AppDatabase {
  readonly repositories: Repositories;
  readonly schemaVersion: number;
  close(): void;
}
