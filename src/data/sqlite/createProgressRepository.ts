import type {
  PatternProgress,
  ProgressRepository,
} from '../contracts/progressRepository';
import type { RepositoryContext } from './repositoryContext';

const SELECT_ACTIVE_STEP =
  'SELECT active_step_id FROM pattern_progress WHERE pattern_id = ?';
const SELECT_COMPLETED_STEPS = `SELECT progress.step_id AS step_id
  FROM pattern_step_progress AS progress
  JOIN pattern_step AS step ON step.id = progress.step_id
  WHERE progress.pattern_id = ? AND progress.completed_at IS NOT NULL
  ORDER BY step.position ASC, step.id ASC`;

/**
 * One statement, so a rapid tap cannot read a stale value and write it back.
 * The `SELECT` supplies `pattern_id` from the step itself, and a missing step
 * inserts nothing instead of creating an orphan.
 */
const UPSERT_STEP_COMPLETION = `INSERT INTO pattern_step_progress (step_id, pattern_id, completed_at, updated_at)
  SELECT id, pattern_id, ?, ? FROM pattern_step WHERE id = ?
  ON CONFLICT (step_id) DO UPDATE
  SET completed_at = excluded.completed_at, updated_at = excluded.updated_at`;

/**
 * The `SELECT` supplies `pattern_id` from the step itself, so a step belonging
 * to another pattern — or no step at all — writes nothing instead of pointing a
 * pattern at a position it does not own.
 */
const UPSERT_ACTIVE_STEP = `INSERT INTO pattern_progress (pattern_id, active_step_id, updated_at)
  SELECT pattern_id, id, ? FROM pattern_step WHERE id = ? AND pattern_id = ?
  ON CONFLICT (pattern_id) DO UPDATE
  SET active_step_id = excluded.active_step_id, updated_at = excluded.updated_at`;

const CLEAR_ACTIVE_STEP = `INSERT INTO pattern_progress (pattern_id, active_step_id, updated_at)
  VALUES (?, NULL, ?)
  ON CONFLICT (pattern_id) DO UPDATE
  SET active_step_id = NULL, updated_at = excluded.updated_at`;

export function createProgressRepository({
  connection,
  now,
}: RepositoryContext): ProgressRepository {
  return {
    getProgress(patternId): PatternProgress {
      const active = connection.first<{
        readonly active_step_id: string | null;
      }>(SELECT_ACTIVE_STEP, [patternId]);

      return {
        patternId,
        activeStepId: active?.active_step_id ?? undefined,
        completedStepIds: connection
          .all<{ readonly step_id: string }>(SELECT_COMPLETED_STEPS, [patternId])
          .map((row) => row.step_id),
      };
    },

    setStepCompleted(stepId, completed) {
      const writtenAt = now();
      connection.run(UPSERT_STEP_COMPLETION, [
        completed ? writtenAt : null,
        writtenAt,
        stepId,
      ]);
    },

    setActiveStep(patternId, stepId) {
      const writtenAt = now();

      if (stepId === null) {
        connection.run(CLEAR_ACTIVE_STEP, [patternId, writtenAt]);
        return;
      }

      connection.run(UPSERT_ACTIVE_STEP, [writtenAt, stepId, patternId]);
    },
  };
}
