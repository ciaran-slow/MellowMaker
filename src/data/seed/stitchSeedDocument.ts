import type {
  SeedStitchInput,
  SeedStitchInstructionInput,
  StitchDifficulty,
} from '../contracts/stitchRepository';

/**
 * The documented format for bundled stitch content. This module is the single
 * specification; `stitchSeed.json` carries no second one.
 *
 * ```json
 * {
 *   "seedVersion": 1,
 *   "terminology": "US",
 *   "stitches": [
 *     {
 *       "slug": "chain",
 *       "name": "Chain",
 *       "abbreviation": "ch",
 *       "difficulty": "beginner",
 *       "summary": "20-140 characters, already trimmed",
 *       "instructions": [
 *         { "instruction": "15-200 characters, already trimmed" },
 *         { "instruction": "an optional imageAssetKey may accompany a step" }
 *       ]
 *     }
 *   ]
 * }
 * ```
 *
 * Rules, all enforced by `parseStitchSeedDocument`:
 *
 * - the root is an object holding exactly `seedVersion`, `terminology`, and
 *   `stitches`; an unknown key is rejected rather than silently dropped;
 * - `seedVersion` is an integer of at least 1 and is a single document-level
 *   stamp for the whole release, never a per-record value;
 * - `terminology` is exactly `"US"`. UK terms name different stitches with the
 *   same words, so mixing them would corrupt abbreviation search;
 * - `stitches` holds at least one record, and each record carries exactly
 *   `slug`, `name`, `abbreviation`, `difficulty`, `summary`, and `instructions`;
 * - `slug` is frozen kebab-case seed identity, unique across the document,
 *   because a seed release is matched by slug;
 * - `abbreviation` is 1-8 ASCII characters with only single interior spaces, and
 *   is unique case-insensitively so abbreviation search cannot be ambiguous.
 *   Mixed case is allowed because patterns write `BLO`, `MR`, and `FO` that way;
 * - `instructions` holds 3-7 objects in maker-visible step order, which the
 *   repository writes to `stitch_instruction.position` from the array index;
 * - `imageAssetKey` is optional, kebab-case, and absent when no local visual
 *   reference is available;
 * - no text may be untrimmed, repeated within a record, equal to its record's
 *   summary, or recognizably placeholder copy.
 *
 * Validation returns a discriminated result and collects every issue, so one run
 * names all content faults instead of only the first.
 */
export interface StitchSeedDocument {
  readonly seedVersion: number;
  readonly terminology: 'US';
  readonly stitches: readonly SeedStitchInput[];
}

export interface StitchSeedIssue {
  /** Dotted path into the document, e.g. `stitches[3].instructions[1].instruction`. */
  readonly path: string;
  readonly message: string;
}

export type StitchSeedParseResult =
  | { readonly ok: true; readonly document: StitchSeedDocument }
  | { readonly ok: false; readonly issues: readonly StitchSeedIssue[] };

/**
 * Raised when the bundled content fails its own format. The message carries
 * issue paths only, never instruction prose, matching the database taxonomy's
 * rule that error text holds no content.
 */
export class StitchSeedError extends Error {
  readonly issues: readonly StitchSeedIssue[];

  constructor(issues: readonly StitchSeedIssue[]) {
    const paths = issues.map((issue) =>
      issue.path === '' ? '<document>' : issue.path,
    );

    super(`Bundled stitch content is invalid at: ${paths.join(', ')}`);
    this.name = 'StitchSeedError';
    this.issues = issues;
  }
}

const DOCUMENT_KEYS = ['seedVersion', 'terminology', 'stitches'] as const;
const STITCH_KEYS = [
  'slug',
  'name',
  'abbreviation',
  'difficulty',
  'summary',
  'instructions',
] as const;
const INSTRUCTION_KEYS = ['instruction', 'imageAssetKey'] as const;

const DIFFICULTIES: readonly StitchDifficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
];

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ABBREVIATION = /^[A-Za-z0-9]+( [A-Za-z0-9]+)*$/;
const PLACEHOLDER =
  /\b(tbd|todo|to do|lorem|ipsum|placeholder|xxx|fixme|coming soon)\b/i;

const NAME_LENGTH = { min: 2, max: 48 } as const;
const ABBREVIATION_LENGTH = { min: 1, max: 8 } as const;
const SUMMARY_LENGTH = { min: 20, max: 140 } as const;
const INSTRUCTION_LENGTH = { min: 15, max: 200 } as const;
const INSTRUCTION_COUNT = { min: 3, max: 7 } as const;

interface Bounds {
  readonly min: number;
  readonly max: number;
}

type Issues = StitchSeedIssue[];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  known: readonly string[],
  prefix: string,
  issues: Issues,
): void {
  for (const key of Object.keys(record)) {
    if (!known.includes(key)) {
      issues.push({
        path: `${prefix}${key}`,
        message: `Unknown key. The documented format allows only ${known.join(', ')}.`,
      });
    }
  }
}

/**
 * Every text field is trimmed by the author, not by the parser: the schema only
 * normalizes inside `stitch.search_text`, so silent trimming here would hide a
 * value the database stores verbatim.
 */
function parseText(
  value: unknown,
  path: string,
  label: string,
  bounds: Bounds,
  issues: Issues,
): string | undefined {
  if (typeof value !== 'string') {
    issues.push({ path, message: `${label} must be a string.` });

    return undefined;
  }

  if (value !== value.trim()) {
    issues.push({
      path,
      message: `${label} must not have leading or trailing whitespace.`,
    });

    return undefined;
  }

  if (value.length < bounds.min || value.length > bounds.max) {
    issues.push({
      path,
      message: `${label} must be ${bounds.min}-${bounds.max} characters; received ${value.length}.`,
    });

    return undefined;
  }

  if (PLACEHOLDER.test(value)) {
    issues.push({
      path,
      message: `${label} reads as placeholder copy, which must never ship as production content.`,
    });

    return undefined;
  }

  return value;
}

function parseSeedVersion(value: unknown, issues: Issues): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    issues.push({
      path: 'seedVersion',
      message: 'seedVersion must be an integer of at least 1.',
    });

    return undefined;
  }

  return value;
}

function parseTerminology(value: unknown, issues: Issues): 'US' | undefined {
  if (value !== 'US') {
    issues.push({
      path: 'terminology',
      message:
        'terminology must be "US". UK terms name different stitches with the same words, so a mixed set would corrupt abbreviation search.',
    });

    return undefined;
  }

  return 'US';
}

function parseDifficulty(
  value: unknown,
  path: string,
  issues: Issues,
): StitchDifficulty | undefined {
  if (
    typeof value !== 'string' ||
    !DIFFICULTIES.includes(value as StitchDifficulty)
  ) {
    issues.push({
      path,
      message: `difficulty must be one of ${DIFFICULTIES.join(', ')}.`,
    });

    return undefined;
  }

  return value as StitchDifficulty;
}

function parseSlug(
  value: unknown,
  path: string,
  issues: Issues,
): string | undefined {
  if (typeof value !== 'string' || !KEBAB_CASE.test(value)) {
    issues.push({
      path,
      message:
        'slug must be lower-case kebab-case, which is the frozen seed identity a release is matched by.',
    });

    return undefined;
  }

  return value;
}

function parseAbbreviation(
  value: unknown,
  path: string,
  issues: Issues,
): string | undefined {
  const text = parseText(
    value,
    path,
    'abbreviation',
    ABBREVIATION_LENGTH,
    issues,
  );
  if (text === undefined) {
    return undefined;
  }

  if (!ABBREVIATION.test(text)) {
    issues.push({
      path,
      message:
        'abbreviation must be ASCII letters and digits with only single interior spaces.',
    });

    return undefined;
  }

  return text;
}

function parseImageAssetKey(
  value: unknown,
  path: string,
  issues: Issues,
): string | undefined {
  if (typeof value !== 'string' || !KEBAB_CASE.test(value)) {
    issues.push({
      path,
      message:
        'imageAssetKey must be a non-empty lower-case kebab-case asset key.',
    });

    return undefined;
  }

  return value;
}

function parseInstruction(
  value: unknown,
  path: string,
  issues: Issues,
): SeedStitchInstructionInput | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      path,
      message: 'Each instruction must be an object holding its step text.',
    });

    return undefined;
  }

  rejectUnknownKeys(record, INSTRUCTION_KEYS, `${path}.`, issues);

  const instruction = parseText(
    record.instruction,
    `${path}.instruction`,
    'instruction',
    INSTRUCTION_LENGTH,
    issues,
  );

  // `exactOptionalPropertyTypes` is on, so an absent key must stay absent rather
  // than become an explicit `undefined` the repository would receive as a value.
  let imageAssetKey: string | undefined;
  if ('imageAssetKey' in record) {
    imageAssetKey = parseImageAssetKey(
      record.imageAssetKey,
      `${path}.imageAssetKey`,
      issues,
    );
    if (imageAssetKey === undefined) {
      return undefined;
    }
  }

  if (instruction === undefined) {
    return undefined;
  }

  return imageAssetKey === undefined
    ? { instruction }
    : { instruction, imageAssetKey };
}

function parseInstructions(
  value: unknown,
  summary: string | undefined,
  path: string,
  issues: Issues,
): readonly SeedStitchInstructionInput[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      path,
      message: 'instructions must be an array of ordered steps.',
    });

    return undefined;
  }

  let complete = true;

  if (
    value.length < INSTRUCTION_COUNT.min ||
    value.length > INSTRUCTION_COUNT.max
  ) {
    issues.push({
      path,
      message: `instructions must hold ${INSTRUCTION_COUNT.min}-${INSTRUCTION_COUNT.max} steps; received ${value.length}.`,
    });
    complete = false;
  }

  const parsed: SeedStitchInstructionInput[] = [];
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    const step = parseInstruction(entry, `${path}[${index}]`, issues);
    if (step === undefined) {
      complete = false;

      return;
    }

    if (seen.has(step.instruction)) {
      issues.push({
        path: `${path}[${index}].instruction`,
        message: 'This step repeats an earlier step of the same stitch.',
      });
      complete = false;

      return;
    }

    if (step.instruction === summary) {
      issues.push({
        path: `${path}[${index}].instruction`,
        message: 'A step must add working detail rather than restate the summary.',
      });
      complete = false;

      return;
    }

    seen.add(step.instruction);
    parsed.push(step);
  });

  return complete ? parsed : undefined;
}

function parseStitch(
  value: unknown,
  path: string,
  issues: Issues,
): SeedStitchInput | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({ path, message: 'Each stitch must be an object.' });

    return undefined;
  }

  rejectUnknownKeys(record, STITCH_KEYS, `${path}.`, issues);

  const slug = parseSlug(record.slug, `${path}.slug`, issues);
  const name = parseText(
    record.name,
    `${path}.name`,
    'name',
    NAME_LENGTH,
    issues,
  );
  const abbreviation = parseAbbreviation(
    record.abbreviation,
    `${path}.abbreviation`,
    issues,
  );
  const difficulty = parseDifficulty(
    record.difficulty,
    `${path}.difficulty`,
    issues,
  );
  const summary = parseText(
    record.summary,
    `${path}.summary`,
    'summary',
    SUMMARY_LENGTH,
    issues,
  );
  const instructions = parseInstructions(
    record.instructions,
    summary,
    `${path}.instructions`,
    issues,
  );

  if (
    slug === undefined ||
    name === undefined ||
    abbreviation === undefined ||
    difficulty === undefined ||
    summary === undefined ||
    instructions === undefined
  ) {
    return undefined;
  }

  // Rebuilt key by key in a fixed order, so the normalized document is
  // independent of key order and formatting in the committed file.
  return { slug, name, abbreviation, difficulty, summary, instructions };
}

function parseStitches(
  value: unknown,
  issues: Issues,
): readonly SeedStitchInput[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      path: 'stitches',
      message: 'stitches must be an array of stitch records.',
    });

    return undefined;
  }

  if (value.length === 0) {
    issues.push({
      path: 'stitches',
      message: 'stitches must hold at least one record.',
    });

    return undefined;
  }

  const parsed: SeedStitchInput[] = [];
  const slugs = new Set<string>();
  const abbreviations = new Set<string>();
  const instructionLists = new Set<string>();
  let complete = true;

  value.forEach((entry, index) => {
    const path = `stitches[${index}]`;
    const record = parseStitch(entry, path, issues);
    if (record === undefined) {
      complete = false;

      return;
    }

    if (slugs.has(record.slug)) {
      issues.push({
        path: `${path}.slug`,
        message: 'slug is already used by an earlier record; seed identity must be unique.',
      });
      complete = false;
    } else {
      slugs.add(record.slug);
    }

    const abbreviation = record.abbreviation.toLowerCase();
    if (abbreviations.has(abbreviation)) {
      issues.push({
        path: `${path}.abbreviation`,
        message:
          'abbreviation is already used by an earlier record, which would make abbreviation search ambiguous.',
      });
      complete = false;
    } else {
      abbreviations.add(abbreviation);
    }

    const steps = JSON.stringify(
      record.instructions.map((step) => step.instruction),
    );
    if (instructionLists.has(steps)) {
      issues.push({
        path: `${path}.instructions`,
        message: 'These steps duplicate another record, which reads as a copied stub.',
      });
      complete = false;
    } else {
      instructionLists.add(steps);
    }

    parsed.push(record);
  });

  return complete ? parsed : undefined;
}

/**
 * Validates bundled content against the documented format, collecting every
 * issue. Nothing passed in is mutated; the result is rebuilt from scratch.
 */
export function parseStitchSeedDocument(
  input: unknown,
): StitchSeedParseResult {
  const record = asRecord(input);
  if (record === undefined) {
    return {
      ok: false,
      issues: [
        {
          path: '',
          message: 'The seed document must be a JSON object.',
        },
      ],
    };
  }

  const issues: Issues = [];

  rejectUnknownKeys(record, DOCUMENT_KEYS, '', issues);

  const seedVersion = parseSeedVersion(record.seedVersion, issues);
  const terminology = parseTerminology(record.terminology, issues);
  const stitches = parseStitches(record.stitches, issues);

  if (
    issues.length > 0 ||
    seedVersion === undefined ||
    terminology === undefined ||
    stitches === undefined
  ) {
    return { ok: false, issues };
  }

  return { ok: true, document: { seedVersion, terminology, stitches } };
}
