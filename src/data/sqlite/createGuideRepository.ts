import type {
  GuideRepository,
  GuideStep,
  GuideStepOrigin,
  GuideWithSteps,
  ImportedGuide,
} from '../contracts/guideRepository';
import type { RepositoryContext } from './repositoryContext';

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
const INSERT_GUIDE = `INSERT INTO imported_guide (${GUIDE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const INSERT_STEP = `INSERT INTO guide_step (${STEP_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const DELETE_GUIDE = 'DELETE FROM imported_guide WHERE id = ?';

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
      return transaction(() => {
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

    deleteGuide(id) {
      // Foreign keys cascade to guide steps and this guide's counters.
      connection.run(DELETE_GUIDE, [id]);
    },
  };
}
