import { resolvePage } from '../contracts/page';
import type {
  GuideRepository,
  GuideStep,
  GuideStepOrigin,
  GuideSummary,
  GuideWithSteps,
  ImportedGuide,
  UpdateGuideDetailsInput,
} from '../contracts/guideRepository';
import { reorderPositions, type ReorderStatements } from './reorderPositions';
import type { RepositoryContext } from './repositoryContext';
import type { TransactionRunner } from './transaction';
import { withStepInstructionGuard } from './writeErrors';

interface GuideRow {
  readonly id: string;
  readonly video_id: string;
  readonly source_url: string;
  readonly title: string;
  readonly creator: string | null;
  readonly thumbnail_url: string | null;
  readonly notes: string | null;
  readonly metadata_synced_at: number | null;
  readonly created_at: number;
  readonly updated_at: number;
}

interface GuideStepRow {
  readonly id: string;
  readonly guide_id: string;
  readonly position: number;
  readonly instruction: string;
  readonly video_offset_ms: number | null;
  readonly transcript_excerpt: string | null;
  readonly note: string | null;
  readonly completed_at: number | null;
  readonly origin: GuideStepOrigin;
  readonly user_modified_at: number | null;
  readonly created_at: number;
  readonly updated_at: number;
}

const GUIDE_COLUMNS =
  'id, video_id, source_url, title, creator, thumbnail_url, notes, metadata_synced_at, created_at, updated_at';
const STEP_COLUMNS =
  'id, guide_id, position, instruction, video_offset_ms, transcript_excerpt, note, completed_at, origin, user_modified_at, created_at, updated_at';

const SELECT_GUIDE = `SELECT ${GUIDE_COLUMNS} FROM imported_guide WHERE id = ?`;
const SELECT_GUIDE_BY_VIDEO = 'SELECT id FROM imported_guide WHERE video_id = ?';
const SELECT_STEPS = `SELECT ${STEP_COLUMNS} FROM guide_step WHERE guide_id = ? ORDER BY position ASC, id ASC`;
const LIST_GUIDES =
  'SELECT id, video_id, title, creator, thumbnail_url, updated_at FROM imported_guide ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?';
const INSERT_GUIDE = `INSERT INTO imported_guide (${GUIDE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const INSERT_STEP = `INSERT INTO guide_step (${STEP_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
// Metadata only: `title` is never listed here, so a refresh cannot overwrite the
// maker's confirmed name, and COALESCE keeps a stored value when a field is
// omitted. No `guide_step` row is ever read or written by a refresh.
const REFRESH_GUIDE_METADATA =
  'UPDATE imported_guide SET creator = COALESCE(?, creator), thumbnail_url = COALESCE(?, thumbnail_url), metadata_synced_at = ?, updated_at = ? WHERE id = ?';
// A deliberate maker edit rewrites the title (unlike a refresh, which never can).
const UPDATE_GUIDE_DETAILS =
  'UPDATE imported_guide SET title = ?, notes = ?, updated_at = ? WHERE id = ?';
const SELECT_STEP_COUNT =
  'SELECT COUNT(*) AS total FROM guide_step WHERE guide_id = ?';
const SELECT_STEP_IDS =
  'SELECT id FROM guide_step WHERE guide_id = ? ORDER BY position ASC, id ASC';
const SELECT_STEP_PARENT = 'SELECT guide_id FROM guide_step WHERE id = ?';
const UPDATE_GUIDE_STEP =
  'UPDATE guide_step SET instruction = ?, video_offset_ms = ?, transcript_excerpt = ?, note = ?, user_modified_at = ?, updated_at = ? WHERE id = ?';
const DELETE_STEP = 'DELETE FROM guide_step WHERE id = ?';
// Completion is one absolute write; it deliberately does not touch the guide's
// `updated_at`, so working state never churns library recency.
const SET_STEP_COMPLETION =
  'UPDATE guide_step SET completed_at = ?, updated_at = ? WHERE id = ?';
const TOUCH_GUIDE = 'UPDATE imported_guide SET updated_at = ? WHERE id = ?';
const DELETE_GUIDE = 'DELETE FROM imported_guide WHERE id = ?';

const GUIDE_STEP_REORDER: ReorderStatements = {
  offsetPositions:
    'UPDATE guide_step SET position = position + ? WHERE guide_id = ?',
  setPosition:
    'UPDATE guide_step SET position = ?, updated_at = ? WHERE id = ? AND guide_id = ?',
};

interface GuideSummaryRow {
  readonly id: string;
  readonly video_id: string;
  readonly title: string;
  readonly creator: string | null;
  readonly thumbnail_url: string | null;
  readonly updated_at: number;
}

function toSummary(row: GuideSummaryRow): GuideSummary {
  return {
    id: row.id,
    videoId: row.video_id,
    title: row.title,
    creator: row.creator ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    updatedAt: row.updated_at,
  };
}

function toGuide(row: GuideRow): ImportedGuide {
  return {
    id: row.id,
    videoId: row.video_id,
    sourceUrl: row.source_url,
    title: row.title,
    creator: row.creator ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    notes: row.notes ?? undefined,
    metadataSyncedAt: row.metadata_synced_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStep(row: GuideStepRow): GuideStep {
  return {
    id: row.id,
    guideId: row.guide_id,
    position: row.position,
    instruction: row.instruction,
    videoOffsetMs: row.video_offset_ms ?? undefined,
    transcriptExcerpt: row.transcript_excerpt ?? undefined,
    note: row.note ?? undefined,
    completedAt: row.completed_at ?? undefined,
    origin: row.origin,
    userModifiedAt: row.user_modified_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createGuideRepository({
  connection,
  transaction,
  now,
  newId,
}: RepositoryContext): GuideRepository {
  // Used by exactly the four methods that write an `instruction`. The guard sits
  // *outside* the transaction runner, so a refusal rolls the whole write back
  // before the typed `DatabaseError('empty-step-instruction')` escapes. Every
  // other method here — completion, the reorders, the deletes, the metadata
  // writes — keeps the plain runner because none of them touches `instruction`.
  const guardedTransaction: TransactionRunner = (work) =>
    withStepInstructionGuard(() => transaction(work));

  function read(id: string): GuideWithSteps | undefined {
    const guide = connection.first<GuideRow>(SELECT_GUIDE, [id]);
    if (guide === undefined) {
      return undefined;
    }

    return {
      guide: toGuide(guide),
      steps: connection.all<GuideStepRow>(SELECT_STEPS, [id]).map(toStep),
    };
  }

  return {
    saveImportedGuide({ guide, steps }) {
      return guardedTransaction(() => {
        const writtenAt = now();
        const guideId = newId();

        connection.run(INSERT_GUIDE, [
          guideId,
          guide.videoId,
          guide.sourceUrl,
          guide.title,
          guide.creator ?? null,
          guide.thumbnailUrl ?? null,
          guide.notes ?? null,
          guide.metadataSyncedAt ?? null,
          writtenAt,
          writtenAt,
        ]);

        steps.forEach((step, position) => {
          connection.run(INSERT_STEP, [
            newId(),
            guideId,
            position,
            step.instruction,
            step.videoOffsetMs ?? null,
            step.transcriptExcerpt ?? null,
            step.note ?? null,
            null,
            step.origin,
            null,
            writtenAt,
            writtenAt,
          ]);
        });

        const saved = read(guideId);
        if (saved === undefined) {
          throw new Error('A guide was written but could not be read back.');
        }

        return saved;
      });
    },

    findGuideByVideoId(videoId) {
      const match = connection.first<{ readonly id: string }>(
        SELECT_GUIDE_BY_VIDEO,
        [videoId],
      );

      return match === undefined ? undefined : read(match.id);
    },

    getGuideWithSteps(id) {
      return read(id);
    },

    listGuides(page) {
      const { limit, offset } = resolvePage(page);

      return connection
        .all<GuideSummaryRow>(LIST_GUIDES, [limit, offset])
        .map(toSummary);
    },

    refreshGuideMetadata(id, input) {
      return transaction(() => {
        connection.run(REFRESH_GUIDE_METADATA, [
          input.creator ?? null,
          input.thumbnailUrl ?? null,
          input.syncedAt,
          now(),
          id,
        ]);

        const refreshed = read(id);
        if (refreshed === undefined) {
          throw new Error('No guide carries the id passed to refreshGuideMetadata.');
        }

        return refreshed;
      });
    },

    updateGuideDetails(input: UpdateGuideDetailsInput): ImportedGuide {
      const writtenAt = now();
      connection.run(UPDATE_GUIDE_DETAILS, [
        input.title,
        input.notes ?? null,
        writtenAt,
        input.id,
      ]);

      const row = connection.first<GuideRow>(SELECT_GUIDE, [input.id]);
      if (row === undefined) {
        throw new Error('No guide carries the id passed to updateGuideDetails.');
      }

      return toGuide(row);
    },

    addGuideStep(guideId, input): GuideStep {
      return guardedTransaction(() => {
        const writtenAt = now();
        const stepId = newId();
        // Positions stay contiguous from zero (see deleteGuideStep), so the count
        // is always MAX(position) + 1 and the append cannot collide with the
        // UNIQUE (guide_id, position) constraint.
        const position =
          connection.first<{ readonly total: number }>(SELECT_STEP_COUNT, [
            guideId,
          ])?.total ?? 0;

        connection.run(INSERT_STEP, [
          stepId,
          guideId,
          position,
          input.instruction,
          input.videoOffsetMs ?? null,
          input.transcriptExcerpt ?? null,
          input.note ?? null,
          null,
          'user',
          null,
          writtenAt,
          writtenAt,
        ]);
        connection.run(TOUCH_GUIDE, [writtenAt, guideId]);

        return {
          id: stepId,
          guideId,
          position,
          instruction: input.instruction,
          videoOffsetMs: input.videoOffsetMs,
          transcriptExcerpt: input.transcriptExcerpt,
          note: input.note,
          completedAt: undefined,
          origin: 'user',
          userModifiedAt: undefined,
          createdAt: writtenAt,
          updatedAt: writtenAt,
        };
      });
    },

    appendImportedGuideSteps(guideId, steps): GuideWithSteps {
      return guardedTransaction(() => {
        const writtenAt = now();
        // Read the count ONCE: positions are contiguous from zero, so the batch
        // lands at count..count+n-1 and cannot straddle UNIQUE (guide_id,
        // position). The whole batch plus the guide touch is one transaction, so
        // a throw part-way through leaves no partial step list behind.
        const startPosition =
          connection.first<{ readonly total: number }>(SELECT_STEP_COUNT, [
            guideId,
          ])?.total ?? 0;

        steps.forEach((step, index) => {
          connection.run(INSERT_STEP, [
            newId(),
            guideId,
            startPosition + index,
            step.instruction,
            step.videoOffsetMs ?? null,
            step.transcriptExcerpt ?? null,
            step.note ?? null,
            null,
            // The origin is owned here, never taken from the caller: parsed
            // steps must stay distinguishable from maker-typed ones.
            'import',
            null,
            writtenAt,
            writtenAt,
          ]);
        });

        if (steps.length > 0) {
          connection.run(TOUCH_GUIDE, [writtenAt, guideId]);
        }

        const saved = read(guideId);
        if (saved === undefined) {
          throw new Error(
            'No guide carries the id passed to appendImportedGuideSteps.',
          );
        }

        return saved;
      });
    },

    updateGuideStep(stepId, input) {
      guardedTransaction(() => {
        const writtenAt = now();
        connection.run(UPDATE_GUIDE_STEP, [
          input.instruction,
          input.videoOffsetMs ?? null,
          input.transcriptExcerpt ?? null,
          input.note ?? null,
          writtenAt,
          writtenAt,
          stepId,
        ]);
        // Derive the parent from the step so a caller can never bump the wrong
        // guide, mirroring the pattern repository's TOUCH_PATTERN_OF_STEP.
        const parent = connection.first<{ readonly guide_id: string }>(
          SELECT_STEP_PARENT,
          [stepId],
        );
        if (parent !== undefined) {
          connection.run(TOUCH_GUIDE, [writtenAt, parent.guide_id]);
        }
      });
    },

    deleteGuideStep(stepId) {
      transaction(() => {
        const parent = connection.first<{ readonly guide_id: string }>(
          SELECT_STEP_PARENT,
          [stepId],
        );
        if (parent === undefined) {
          // Nothing to remove; a stale id is a no-op, not a fault.
          return;
        }

        const guideId = parent.guide_id;
        connection.run(DELETE_STEP, [stepId]);

        const remainingIds = connection
          .all<{ readonly id: string }>(SELECT_STEP_IDS, [guideId])
          .map((row) => row.id);
        const removedAt = now();
        // Close the gap the delete left so positions stay contiguous from zero.
        reorderPositions(
          connection,
          GUIDE_STEP_REORDER,
          guideId,
          remainingIds,
          removedAt,
        );
        connection.run(TOUCH_GUIDE, [removedAt, guideId]);
      });
    },

    reorderGuideSteps(guideId, orderedStepIds) {
      transaction(() => {
        const currentIds = connection
          .all<{ readonly id: string }>(SELECT_STEP_IDS, [guideId])
          .map((row) => row.id);
        const requested = new Set(orderedStepIds);

        if (
          requested.size !== orderedStepIds.length ||
          currentIds.length !== orderedStepIds.length ||
          !currentIds.every((id) => requested.has(id))
        ) {
          throw new Error(
            "A reorder must list each of the guide's current steps exactly once.",
          );
        }

        const reorderedAt = now();
        reorderPositions(
          connection,
          GUIDE_STEP_REORDER,
          guideId,
          orderedStepIds,
          reorderedAt,
        );
        connection.run(TOUCH_GUIDE, [reorderedAt, guideId]);
      });
    },

    setGuideStepCompleted(stepId, completed) {
      // One absolute autocommit statement (no transaction, no read-modify-write):
      // the target `completed_at` is a single instant or `NULL`, fixed by the
      // boolean, so rapid taps commit in issue order and land on the last command
      // per step.
      const writtenAt = now();
      connection.run(SET_STEP_COMPLETION, [
        completed ? writtenAt : null,
        writtenAt,
        stepId,
      ]);
    },

    deleteGuide(id) {
      // Foreign keys cascade to guide steps and this guide's counters.
      connection.run(DELETE_GUIDE, [id]);
    },
  };
}
