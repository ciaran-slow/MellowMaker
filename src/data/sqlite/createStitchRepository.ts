import { normalizeStitchQuery } from '@/domain/stitches/stitchQuery';

import { resolvePage } from '../contracts/page';
import type {
  ContentOwnership,
  SeedStitchInput,
  SeedUpsertResult,
  StitchDetail,
  StitchDifficulty,
  StitchInstruction,
  StitchRepository,
  StitchSummary,
} from '../contracts/stitchRepository';
import type { RepositoryContext } from './repositoryContext';

interface StitchRow {
  readonly id: string;
  readonly slug: string | null;
  readonly name: string;
  readonly abbreviation: string;
  readonly difficulty: StitchDifficulty;
  readonly summary: string;
  readonly ownership: ContentOwnership;
  readonly seed_version: number | null;
  readonly user_modified_at: number | null;
  readonly created_at: number;
  readonly updated_at: number;
}

interface StitchInstructionRow {
  readonly id: string;
  readonly position: number;
  readonly instruction: string;
  readonly image_asset_key: string | null;
}

const STITCH_COLUMNS =
  'id, slug, name, abbreviation, difficulty, summary, ownership, seed_version, user_modified_at, created_at, updated_at';

const LIST_STITCHES = `SELECT ${STITCH_COLUMNS} FROM stitch ORDER BY search_text ASC, id ASC LIMIT ? OFFSET ?`;
// Two token-prefix clauses rather than one `%query%`: `search_text` is
// `"<name> <abbreviation>"`, so a substring match would return *Half double
// crochet* for `dc`. Matching at the start of the string or immediately after a
// space keeps abbreviations exact, still matches multi-word names, and leaves
// the first clause eligible for `stitch_search_text_idx`.
const SEARCH_STITCHES = `SELECT ${STITCH_COLUMNS} FROM stitch WHERE search_text LIKE ? ESCAPE '\\' OR search_text LIKE ? ESCAPE '\\' ORDER BY search_text ASC, id ASC LIMIT ? OFFSET ?`;
const SELECT_STITCH = `SELECT ${STITCH_COLUMNS} FROM stitch WHERE id = ?`;
const SELECT_STITCH_BY_SLUG =
  'SELECT id, ownership, user_modified_at FROM stitch WHERE slug = ?';
// `MAX` rather than `MIN`: a maker-edited row keeps its old `seed_version`
// forever, so `MIN` would make every launch re-import the bundled content.
const SELECT_APPLIED_SEED_VERSION =
  "SELECT MAX(seed_version) AS version FROM stitch WHERE ownership = 'seed'";
const SELECT_INSTRUCTIONS =
  'SELECT id, position, instruction, image_asset_key FROM stitch_instruction WHERE stitch_id = ? ORDER BY position ASC, id ASC';
const INSERT_STITCH = `INSERT INTO stitch (${STITCH_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const UPDATE_SEEDED_STITCH = `UPDATE stitch
  SET name = ?, abbreviation = ?, difficulty = ?, summary = ?, seed_version = ?, updated_at = ?
  WHERE id = ?`;
const DELETE_INSTRUCTIONS =
  'DELETE FROM stitch_instruction WHERE stitch_id = ?';
const INSERT_INSTRUCTION = `INSERT INTO stitch_instruction (id, stitch_id, position, instruction, image_asset_key, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

function toSummary(row: StitchRow): StitchSummary {
  return {
    id: row.id,
    slug: row.slug ?? undefined,
    name: row.name,
    abbreviation: row.abbreviation,
    difficulty: row.difficulty,
    summary: row.summary,
    ownership: row.ownership,
  };
}

function toInstruction(row: StitchInstructionRow): StitchInstruction {
  return {
    id: row.id,
    position: row.position,
    instruction: row.instruction,
    imageAssetKey: row.image_asset_key ?? undefined,
  };
}

export function createStitchRepository({
  connection,
  transaction,
  now,
  newId,
}: RepositoryContext): StitchRepository {
  function writeInstructions(
    stitchId: string,
    records: SeedStitchInput['instructions'],
    writtenAt: number,
  ): void {
    connection.run(DELETE_INSTRUCTIONS, [stitchId]);

    records.forEach((record, position) => {
      connection.run(INSERT_INSTRUCTION, [
        newId(),
        stitchId,
        position,
        record.instruction,
        record.imageAssetKey ?? null,
        writtenAt,
        writtenAt,
      ]);
    });
  }

  return {
    listStitches(page) {
      const { limit, offset } = resolvePage(page);

      return connection
        .all<StitchRow>(LIST_STITCHES, [limit, offset])
        .map(toSummary);
    },

    searchStitches(query, page) {
      const { limit, offset } = resolvePage(page);
      const normalized = normalizeStitchQuery(query);

      if (normalized === '') {
        // Blank searches share the browse statement so ordering and bounds
        // cannot drift between the two reads.
        return connection
          .all<StitchRow>(LIST_STITCHES, [limit, offset])
          .map(toSummary);
      }

      // `LIKE` metacharacters a maker typed are matched literally, so `%`
      // finds the stitches actually containing a per-cent sign — none — rather
      // than the whole catalogue.
      const escaped = normalized.replace(/[\\%_]/gu, '\\$&');

      return connection
        .all<StitchRow>(SEARCH_STITCHES, [
          `${escaped}%`,
          `% ${escaped}%`,
          limit,
          offset,
        ])
        .map(toSummary);
    },

    getStitchDetail(id): StitchDetail | undefined {
      const row = connection.first<StitchRow>(SELECT_STITCH, [id]);
      if (row === undefined) {
        return undefined;
      }

      return {
        ...toSummary(row),
        seedVersion: row.seed_version ?? undefined,
        userModifiedAt: row.user_modified_at ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        instructions: connection
          .all<StitchInstructionRow>(SELECT_INSTRUCTIONS, [id])
          .map(toInstruction),
      };
    },

    appliedSeedVersion(): number | undefined {
      // The aggregate reports `null` for an empty table and for a database
      // holding only maker-owned stitches; both mean no release is applied.
      return (
        connection.first<{ readonly version: number | null }>(
          SELECT_APPLIED_SEED_VERSION,
        )?.version ?? undefined
      );
    },

    upsertSeededStitches(seedVersion, records): SeedUpsertResult {
      return transaction(() => {
        let inserted = 0;
        let updated = 0;
        let skipped = 0;

        for (const record of records) {
          const writtenAt = now();
          const existing = connection.first<{
            readonly id: string;
            readonly ownership: ContentOwnership;
            readonly user_modified_at: number | null;
          }>(SELECT_STITCH_BY_SLUG, [record.slug]);

          if (existing === undefined) {
            const id = newId();
            connection.run(INSERT_STITCH, [
              id,
              record.slug,
              record.name,
              record.abbreviation,
              record.difficulty,
              record.summary,
              'seed',
              seedVersion,
              null,
              writtenAt,
              writtenAt,
            ]);
            writeInstructions(id, record.instructions, writtenAt);
            inserted += 1;
            continue;
          }

          // A seed release may only touch seeded rows the maker has not edited.
          if (
            existing.ownership !== 'seed' ||
            existing.user_modified_at !== null
          ) {
            skipped += 1;
            continue;
          }

          connection.run(UPDATE_SEEDED_STITCH, [
            record.name,
            record.abbreviation,
            record.difficulty,
            record.summary,
            seedVersion,
            writtenAt,
            existing.id,
          ]);
          writeInstructions(existing.id, record.instructions, writtenAt);
          updated += 1;
        }

        return { inserted, updated, skipped };
      });
    },
  };
}
