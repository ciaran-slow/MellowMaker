import { resolvePage } from '../contracts/page';
import type {
  CreatePatternInput,
  PatternOrigin,
  PatternRepository,
  PatternStep,
  PatternSummary,
  PatternWithSteps,
  SeedPatternResult,
  UpdatePatternInput,
} from '../contracts/patternRepository';
import { reorderPositions, type ReorderStatements } from './reorderPositions';
import type { RepositoryContext } from './repositoryContext';
import type { TransactionRunner } from './transaction';
import { withStepInstructionGuard } from './writeErrors';

interface PatternRow {
  readonly id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly created_at: number;
  readonly updated_at: number;
  readonly origin: PatternOrigin;
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
  'SELECT id, title, notes, created_at, updated_at, origin FROM pattern WHERE id = ?';
const LIST_PATTERNS =
  'SELECT id, title, notes, created_at, updated_at, origin FROM pattern ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?';
const SELECT_STEPS =
  'SELECT id, pattern_id, position, instruction, created_at, updated_at FROM pattern_step WHERE pattern_id = ? ORDER BY position ASC, id ASC';
const SELECT_STEP_IDS =
  'SELECT id FROM pattern_step WHERE pattern_id = ? ORDER BY position ASC, id ASC';
const SELECT_STEP_COUNT =
  'SELECT COUNT(*) AS total FROM pattern_step WHERE pattern_id = ?';
const SELECT_STEP_PARENT = 'SELECT pattern_id FROM pattern_step WHERE id = ?';
// `origin` is named rather than left to the column default: which provenance a
// write intends belongs in the SQL, not in a schema fallback.
const INSERT_PATTERN =
  "INSERT INTO pattern (id, title, notes, created_at, updated_at, origin) VALUES (?, ?, ?, ?, ?, 'user')";
const INSERT_SEEDED_PATTERN =
  "INSERT INTO pattern (id, title, notes, created_at, updated_at, origin) VALUES (?, ?, ?, ?, ?, 'bundled')";
// The launch guard reads the ledger, never the pattern rows: a maker who deleted
// every bundled pattern must not look like a maker who has never been seeded.
const SELECT_APPLIED_PATTERN_SEED_VERSION =
  'SELECT MAX(seed_version) AS version FROM pattern_seed_state';
const SELECT_SEEDED_SLUG = 'SELECT slug FROM pattern_seed_state WHERE slug = ?';
const SELECT_RECENCY_ANCHOR = 'SELECT MIN(updated_at) AS anchor FROM pattern';
const INSERT_SEED_LEDGER_ROW =
  'INSERT INTO pattern_seed_state (slug, pattern_id, seed_version, seeded_at) VALUES (?, ?, ?, ?)';
const STAMP_SEED_LEDGER_VERSION =
  'UPDATE pattern_seed_state SET seed_version = ?';
const INSERT_STEP =
  'INSERT INTO pattern_step (id, pattern_id, position, instruction, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)';
const UPDATE_PATTERN_DETAILS =
  'UPDATE pattern SET title = ?, notes = ?, updated_at = ? WHERE id = ?';
const UPDATE_STEP_INSTRUCTION =
  'UPDATE pattern_step SET instruction = ?, updated_at = ? WHERE id = ?';
// Derives the parent from the step so a caller can never bump the wrong pattern.
const TOUCH_PATTERN_OF_STEP =
  'UPDATE pattern SET updated_at = ? WHERE id = (SELECT pattern_id FROM pattern_step WHERE id = ?)';
const TOUCH_PATTERN = 'UPDATE pattern SET updated_at = ? WHERE id = ?';
const DELETE_STEP = 'DELETE FROM pattern_step WHERE id = ?';
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
    origin: row.origin,
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
  // Used by exactly the four methods that write an `instruction`. The guard sits
  // *outside* the transaction runner, so a refusal rolls the whole write back
  // before the typed `DatabaseError('empty-step-instruction')` escapes. The
  // reorders and the deletes keep the plain runner because none of them touches
  // `instruction`.
  const guardedTransaction: TransactionRunner = (work) =>
    withStepInstructionGuard(() => transaction(work));

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
      return guardedTransaction(() => {
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

    updatePattern(input: UpdatePatternInput): PatternSummary {
      const writtenAt = now();
      connection.run(UPDATE_PATTERN_DETAILS, [
        input.title,
        input.notes ?? null,
        writtenAt,
        input.id,
      ]);

      const row = connection.first<PatternRow>(SELECT_PATTERN, [input.id]);
      if (row === undefined) {
        throw new Error('No pattern carries the id passed to updatePattern.');
      }

      return toSummary(row);
    },

    addStep(patternId, instruction): PatternStep {
      return guardedTransaction(() => {
        const writtenAt = now();
        const stepId = newId();
        // Positions stay contiguous from zero (see deleteStep), so the count is
        // always MAX(position) + 1 and the append cannot collide with the
        // UNIQUE (pattern_id, position) constraint.
        const position =
          connection.first<{ readonly total: number }>(SELECT_STEP_COUNT, [
            patternId,
          ])?.total ?? 0;

        connection.run(INSERT_STEP, [
          stepId,
          patternId,
          position,
          instruction,
          writtenAt,
          writtenAt,
        ]);
        connection.run(TOUCH_PATTERN, [writtenAt, patternId]);

        return {
          id: stepId,
          patternId,
          position,
          instruction,
          createdAt: writtenAt,
          updatedAt: writtenAt,
        };
      });
    },

    editStep(stepId, instruction) {
      guardedTransaction(() => {
        const writtenAt = now();
        connection.run(UPDATE_STEP_INSTRUCTION, [
          instruction,
          writtenAt,
          stepId,
        ]);
        connection.run(TOUCH_PATTERN_OF_STEP, [writtenAt, stepId]);
      });
    },

    deleteStep(stepId) {
      transaction(() => {
        const parent = connection.first<{ readonly pattern_id: string }>(
          SELECT_STEP_PARENT,
          [stepId],
        );
        if (parent === undefined) {
          // Nothing to remove; a stale id is a no-op, not a fault.
          return;
        }

        const patternId = parent.pattern_id;
        connection.run(DELETE_STEP, [stepId]);

        const remainingIds = connection
          .all<{ readonly id: string }>(SELECT_STEP_IDS, [patternId])
          .map((row) => row.id);
        const removedAt = now();
        // Close the gap the delete left so positions stay contiguous from zero.
        reorderPositions(
          connection,
          STEP_REORDER,
          patternId,
          remainingIds,
          removedAt,
        );
        connection.run(TOUCH_PATTERN, [removedAt, patternId]);
      });
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
      // row, and counters, so one statement removes the whole aggregate. A
      // bundled pattern's ledger row is `ON DELETE SET NULL`, so it survives as
      // the tombstone that stops the seed re-inserting the slug.
      connection.run(DELETE_PATTERN, [id]);
    },

    appliedPatternSeedVersion(): number | undefined {
      // The aggregate reports `null` for an empty ledger, which is the only
      // state meaning no release has ever been applied.
      return (
        connection.first<{ readonly version: number | null }>(
          SELECT_APPLIED_PATTERN_SEED_VERSION,
        )?.version ?? undefined
      );
    },

    insertSeededPatterns(seedVersion, records): SeedPatternResult {
      return guardedTransaction(() => {
        // Read once, before the loop. The library orders by `updated_at DESC`,
        // so anchoring below the oldest pattern already present puts the
        // starters underneath a maker's in-progress work, and deriving each
        // instant from the document index keeps them strictly distinct and
        // strictly descending — a per-insert `now()` would tie them within one
        // millisecond and float them above the maker's own projects.
        const anchor =
          connection.first<{ readonly anchor: number | null }>(
            SELECT_RECENCY_ANCHOR,
          )?.anchor ?? now();
        let inserted = 0;
        let skipped = 0;

        records.forEach((record, index) => {
          const ledgered = connection.first<{ readonly slug: string }>(
            SELECT_SEEDED_SLUG,
            [record.slug],
          );
          if (ledgered !== undefined) {
            // Deliberately does not consult the `pattern` table: an already
            // ledgered slug is skipped whether the maker still has the pattern,
            // has edited it, or has deleted it outright.
            skipped += 1;

            return;
          }

          const at = anchor - 1 - index;
          const patternId = newId();

          connection.run(INSERT_SEEDED_PATTERN, [
            patternId,
            record.title,
            record.notes,
            at,
            at,
          ]);
          record.steps.forEach((instruction, position) => {
            connection.run(INSERT_STEP, [
              newId(),
              patternId,
              position,
              instruction,
              at,
              at,
            ]);
          });
          connection.run(INSERT_SEED_LEDGER_ROW, [
            record.slug,
            patternId,
            seedVersion,
            now(),
          ]);
          inserted += 1;
        });

        // Stamp the release version even when it added no new slug, so the
        // launch guard's `MAX` equals the applied version and a bump is not
        // re-attempted on every relaunch.
        connection.run(STAMP_SEED_LEDGER_VERSION, [seedVersion]);

        return { inserted, skipped };
      });
    },
  };
}
