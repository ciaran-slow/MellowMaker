import type { SqliteConnection } from '@/data/sqlite/sqliteConnection';

/**
 * A schema-version-1 database holding realistic maker data: two patterns with
 * ordered steps and notes, one completed step, an active-step pointer, an
 * imported guide with a timestamped step and a note, and a counter at seven.
 *
 * Every expected value below is a literal so migration assertions cannot be
 * satisfied by re-deriving them from the schema under test.
 */
export const BASELINE = {
  patterns: [
    {
      id: 'pattern-sunrise',
      title: 'Sunrise Blanket',
      notes: 'Hook 5.0 mm, cotton yarn',
      createdAt: 1_699_000_000_000,
      updatedAt: 1_699_000_100_000,
      steps: [
        { id: 'step-sunrise-0', position: 0, instruction: 'Chain 41' },
        {
          id: 'step-sunrise-1',
          position: 1,
          instruction: 'Single crochet in each chain across',
        },
        {
          id: 'step-sunrise-2',
          position: 2,
          instruction: 'Chain 1, turn, and repeat until 40 rows',
        },
      ],
    },
    {
      id: 'pattern-hedgehog',
      title: 'Tiny Hedgehog',
      notes: null,
      createdAt: 1_699_000_500_000,
      updatedAt: 1_699_000_600_000,
      steps: [
        { id: 'step-hedgehog-0', position: 0, instruction: 'Magic ring, 6 sc' },
        { id: 'step-hedgehog-1', position: 1, instruction: 'Increase to 12 sc' },
      ],
    },
  ],
  completedStep: {
    stepId: 'step-sunrise-0',
    patternId: 'pattern-sunrise',
    completedAt: 1_699_000_200_000,
  },
  activeStep: {
    patternId: 'pattern-sunrise',
    activeStepId: 'step-sunrise-1',
    updatedAt: 1_699_000_300_000,
  },
  guide: {
    id: 'guide-granny-square',
    videoId: 'mM8Wx2pQ1nA',
    sourceUrl: 'https://www.youtube.com/watch?v=mM8Wx2pQ1nA',
    title: 'Granny square basics',
    creator: 'Mellow Makes',
    thumbnailUrl: 'https://i.ytimg.com/vi/mM8Wx2pQ1nA/hqdefault.jpg',
    notes: 'Follow along slowly the first time',
    metadataSyncedAt: 1_699_000_700_000,
    createdAt: 1_699_000_700_000,
    updatedAt: 1_699_000_700_000,
    step: {
      id: 'guide-step-magic-ring',
      position: 0,
      instruction: 'Make a magic ring and chain three',
      videoOffsetMs: 42_000,
      transcriptExcerpt: 'start with a magic ring, then chain three',
      note: 'Keep the ring loose so it can be pulled tight later',
    },
  },
  counter: {
    id: 'counter-sunrise-rows',
    patternId: 'pattern-sunrise',
    label: 'Rows',
    kind: 'row',
    value: 7,
    position: 0,
    createdAt: 1_699_000_800_000,
    updatedAt: 1_699_000_900_000,
  },
} as const;

export function insertPopulatedBaseline(connection: SqliteConnection): void {
  for (const pattern of BASELINE.patterns) {
    connection.run(
      'INSERT INTO pattern (id, title, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [
        pattern.id,
        pattern.title,
        pattern.notes,
        pattern.createdAt,
        pattern.updatedAt,
      ],
    );

    for (const step of pattern.steps) {
      connection.run(
        'INSERT INTO pattern_step (id, pattern_id, position, instruction, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          step.id,
          pattern.id,
          step.position,
          step.instruction,
          pattern.createdAt,
          pattern.updatedAt,
        ],
      );
    }
  }

  connection.run(
    'INSERT INTO pattern_step_progress (step_id, pattern_id, completed_at, updated_at) VALUES (?, ?, ?, ?)',
    [
      BASELINE.completedStep.stepId,
      BASELINE.completedStep.patternId,
      BASELINE.completedStep.completedAt,
      BASELINE.completedStep.completedAt,
    ],
  );

  connection.run(
    'INSERT INTO pattern_progress (pattern_id, active_step_id, updated_at) VALUES (?, ?, ?)',
    [
      BASELINE.activeStep.patternId,
      BASELINE.activeStep.activeStepId,
      BASELINE.activeStep.updatedAt,
    ],
  );

  connection.run(
    `INSERT INTO imported_guide (id, video_id, source_url, title, creator, thumbnail_url, notes, metadata_synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      BASELINE.guide.id,
      BASELINE.guide.videoId,
      BASELINE.guide.sourceUrl,
      BASELINE.guide.title,
      BASELINE.guide.creator,
      BASELINE.guide.thumbnailUrl,
      BASELINE.guide.notes,
      BASELINE.guide.metadataSyncedAt,
      BASELINE.guide.createdAt,
      BASELINE.guide.updatedAt,
    ],
  );

  connection.run(
    `INSERT INTO guide_step (id, guide_id, position, instruction, video_offset_ms, transcript_excerpt, note, completed_at, origin, user_modified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      BASELINE.guide.step.id,
      BASELINE.guide.id,
      BASELINE.guide.step.position,
      BASELINE.guide.step.instruction,
      BASELINE.guide.step.videoOffsetMs,
      BASELINE.guide.step.transcriptExcerpt,
      BASELINE.guide.step.note,
      null,
      'import',
      null,
      BASELINE.guide.createdAt,
      BASELINE.guide.updatedAt,
    ],
  );

  connection.run(
    `INSERT INTO counter (id, owner_kind, pattern_id, guide_id, label, kind, value, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      BASELINE.counter.id,
      'pattern',
      BASELINE.counter.patternId,
      null,
      BASELINE.counter.label,
      BASELINE.counter.kind,
      BASELINE.counter.value,
      BASELINE.counter.position,
      BASELINE.counter.createdAt,
      BASELINE.counter.updatedAt,
    ],
  );
}
