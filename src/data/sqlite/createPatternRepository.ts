import { resolvePage } from '../contracts/page';
import type {
  CreatePatternInput,
  PatternRepository,
  PatternStep,
  PatternSummary,
  PatternWithSteps,
} from '../contracts/patternRepository';
import { reorderPositions, type ReorderStatements } from './reorderPositions';
import type { RepositoryContext } from './repositoryContext';

interface PatternRow {
  readonly id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly created_at: number;
  readonly updated_at: number;
}

interface PatternStepRow {
  readonly id: string;
  readonly pattern_id: string;
  readonly position: number;
  readonly instruction: string;
  readonly created_at: number;
  readonly updated_at: number;
}

const SELECT_PATTERN =
  'SELECT id, title, notes, created_at, updated_at FROM pattern WHERE id = ?';
const LIST_PATTERNS =
  'SELECT id, title, notes, created_at, updated_at FROM pattern ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?';
const SELECT_STEPS =
  'SELECT id, pattern_id, position, instruction, created_at, updated_at FROM pattern_step WHERE pattern_id = ? ORDER BY position ASC, id ASC';
const SELECT_STEP_IDS =
  'SELECT id FROM pattern_step WHERE pattern_id = ? ORDER BY position ASC, id ASC';
const INSERT_PATTERN =
  'INSERT INTO pattern (id, title, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?)';
const INSERT_STEP =
  'INSERT INTO pattern_step (id, pattern_id, position, instruction, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)';
const TOUCH_PATTERN = 'UPDATE pattern SET updated_at = ? WHERE id = ?';
const DELETE_PATTERN = 'DELETE FROM pattern WHERE id = ?';

const STEP_REORDER: ReorderStatements = {
  offsetPositions:
    'UPDATE pattern_step SET position = position + ? WHERE pattern_id = ?',
  setPosition:
    'UPDATE pattern_step SET position = ?, updated_at = ? WHERE id = ? AND pattern_id = ?',
};

// Shared by the list and the detail read so their row mapping cannot drift.
function toSummary(row: PatternRow): PatternSummary {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStep(row: PatternStepRow): PatternStep {
  return {
    id: row.id,
    patternId: row.pattern_id,
    position: row.position,
    instruction: row.instruction,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createPatternRepository({
  connection,
  transaction,
  now,
  newId,
}: RepositoryContext): PatternRepository {
  function read(id: string): PatternWithSteps | undefined {
    const pattern = connection.first<PatternRow>(SELECT_PATTERN, [id]);
    if (pattern === undefined) {
      return undefined;
    }

    return {
      pattern: toSummary(pattern),
      steps: connection.all<PatternStepRow>(SELECT_STEPS, [id]).map(toStep),
    };
  }

  return {
    createPattern(input: CreatePatternInput): PatternWithSteps {
      return transaction(() => {
        const writtenAt = now();
        const patternId = newId();

        connection.run(INSERT_PATTERN, [
          patternId,
          input.title,
          input.notes ?? null,
          writtenAt,
          writtenAt,
        ]);

        input.steps.forEach((instruction, position) => {
          connection.run(INSERT_STEP, [
            newId(),
            patternId,
            position,
            instruction,
            writtenAt,
            writtenAt,
          ]);
        });

        const created = read(patternId);
        if (created === undefined) {
          throw new Error('A pattern was written but could not be read back.');
        }

        return created;
      });
    },

    listPatterns(page) {
      const { limit, offset } = resolvePage(page);

      return connection
        .all<PatternRow>(LIST_PATTERNS, [limit, offset])
        .map(toSummary);
    },

    getPatternWithSteps(id) {
      return read(id);
    },

    reorderSteps(patternId, orderedStepIds) {
      transaction(() => {
        const currentIds = connection
          .all<{ readonly id: string }>(SELECT_STEP_IDS, [patternId])
          .map((row) => row.id);
        const requested = new Set(orderedStepIds);

        if (
          requested.size !== orderedStepIds.length ||
          currentIds.length !== orderedStepIds.length ||
          !currentIds.every((id) => requested.has(id))
        ) {
          throw new Error(
            'A reorder must list each of the pattern\'s current steps exactly once.',
          );
        }

        const reorderedAt = now();
        reorderPositions(
          connection,
          STEP_REORDER,
          patternId,
          orderedStepIds,
          reorderedAt,
        );
        connection.run(TOUCH_PATTERN, [reorderedAt, patternId]);
      });
    },

    deletePattern(id) {
      // Foreign keys cascade to steps, per-step progress, the active position
      // row, and counters, so one statement removes the whole aggregate.
      connection.run(DELETE_PATTERN, [id]);
    },
  };
}
