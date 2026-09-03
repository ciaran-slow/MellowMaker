import type { SeedPatternInput } from '../contracts/patternRepository';

/**
 * The documented format for bundled pattern content. This module is the single
 * specification; `patternSeed.json` carries no second one.
 *
 * ```json
 * {
 *   "seedVersion": 1,
 *   "terminology": "US",
 *   "patterns": [
 *     {
 *       "slug": "practice-swatch",
 *       "title": "Practice Swatch",
 *       "notes": "Hook 5.0 mm · Worsted (medium 4) cotton · Finishes about 12 cm square",
 *       "steps": [
 *         "10-200 characters, already trimmed, one action per step",
 *         "the array index becomes pattern_step.position"
 *       ]
 *     }
 *   ]
 * }
 * ```
 *
 * Rules, all enforced by `parsePatternSeedDocument`:
 *
 * - the root is an object holding exactly `seedVersion`, `terminology`, and
 *   `patterns`; an unknown key is rejected rather than silently dropped;
 * - `seedVersion` is an integer of at least 1 and is a single document-level
 *   stamp for the whole release, never a per-record value;
 * - `terminology` is exactly `"US"`. The steps write `sc`, `hdc`, `dc`, and
 *   `sl st`, and UK terms name different stitches with the same words, so a
 *   mixed set would make the bundled patterns contradict the bundled dictionary;
 * - `patterns` holds 1-12 records, each carrying exactly `slug`, `title`,
 *   `notes`, and `steps`;
 * - `slug` is frozen lower-case kebab-case seed identity, unique across the
 *   document, because the durable seed ledger is keyed on it;
 * - `title` is 2-60 characters and unique case-insensitively, so two library
 *   rows can never read identically;
 * - `notes` is 20-200 characters and must name a hook size in millimetres, which
 *   is the issue's hook/yarn requirement made mechanical;
 * - `steps` holds 4-12 strings in maker-visible order, which the repository
 *   writes to `pattern_step.position` from the array index;
 * - no text may be untrimmed, repeated within a record, equal to its record's
 *   notes, or recognizably placeholder copy;
 * - no two records may share an identical step list, which reads as a copied
 *   stub.
 *
 * Unlike the stitch format, a step is a plain string rather than an object:
 * `CreatePatternInput.steps` is `readonly string[]` and a pattern step has no
 * optional companion field the way an instruction has `imageAssetKey`.
 *
 * Validation returns a discriminated result and collects every issue, so one run
 * names all content faults instead of only the first.
 */
export interface PatternSeedDocument {
  readonly seedVersion: number;
  readonly terminology: 'US';
  readonly patterns: readonly SeedPatternInput[];
}

export interface PatternSeedIssue {
  /** Dotted path into the document, e.g. `patterns[3].steps[1]`. */
  readonly path: string;
  readonly message: string;
}

export type PatternSeedParseResult =
  | { readonly ok: true; readonly document: PatternSeedDocument }
  | { readonly ok: false; readonly issues: readonly PatternSeedIssue[] };

/**
 * Raised when the bundled content fails its own format. The message carries
 * issue paths only, never step prose, matching the database taxonomy's rule that
 * error text holds no content.
 */
export class PatternSeedError extends Error {
  readonly issues: readonly PatternSeedIssue[];

  constructor(issues: readonly PatternSeedIssue[]) {
    const paths = issues.map((issue) =>
      issue.path === '' ? '<document>' : issue.path,
    );

    super(`Bundled pattern content is invalid at: ${paths.join(', ')}`);
    this.name = 'PatternSeedError';
    this.issues = issues;
  }
}

const DOCUMENT_KEYS = ['seedVersion', 'terminology', 'patterns'] as const;
const PATTERN_KEYS = ['slug', 'title', 'notes', 'steps'] as const;

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PLACEHOLDER =
  /\b(tbd|todo|to do|lorem|ipsum|placeholder|xxx|fixme|coming soon)\b/i;
/** A hook size in millimetres, the one mechanical part of "hook and yarn notes". */
const HOOK_SIZE = /\b\d+(\.\d+)?\s?mm\b/;

const TITLE_LENGTH = { min: 2, max: 60 } as const;
const NOTES_LENGTH = { min: 20, max: 200 } as const;
const STEP_LENGTH = { min: 10, max: 200 } as const;
const STEP_COUNT = { min: 4, max: 12 } as const;
const PATTERN_COUNT = { min: 1, max: 12 } as const;

interface Bounds {
  readonly min: number;
  readonly max: number;
}

type Issues = PatternSeedIssue[];

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
 * Every text field is trimmed by the author, not by the parser: the schema
 * stores pattern text verbatim, so silent trimming here would hide a value the
 * database keeps.
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
        'terminology must be "US". UK terms name different stitches with the same words, so a mixed set would make the bundled patterns contradict the bundled dictionary.',
    });

    return undefined;
  }

  return 'US';
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
        'slug must be lower-case kebab-case, which is the frozen seed identity the pattern ledger is keyed on.',
    });

    return undefined;
  }

  return value;
}

function parseNotes(
  value: unknown,
  path: string,
  issues: Issues,
): string | undefined {
  const text = parseText(value, path, 'notes', NOTES_LENGTH, issues);
  if (text === undefined) {
    return undefined;
  }

  if (!HOOK_SIZE.test(text)) {
    issues.push({
      path,
      message:
        'notes must name a hook size in millimetres, so a maker knows what to pick up before starting.',
    });

    return undefined;
  }

  return text;
}

function parseSteps(
  value: unknown,
  notes: string | undefined,
  path: string,
  issues: Issues,
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      path,
      message: 'steps must be an array of ordered instruction strings.',
    });

    return undefined;
  }

  let complete = true;

  if (value.length < STEP_COUNT.min || value.length > STEP_COUNT.max) {
    issues.push({
      path,
      message: `steps must hold ${STEP_COUNT.min}-${STEP_COUNT.max} instructions; received ${value.length}.`,
    });
    complete = false;
  }

  const parsed: string[] = [];
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    const step = parseText(
      entry,
      `${path}[${index}]`,
      'step',
      STEP_LENGTH,
      issues,
    );
    if (step === undefined) {
      complete = false;

      return;
    }

    if (seen.has(step)) {
      issues.push({
        path: `${path}[${index}]`,
        message: 'This step repeats an earlier step of the same pattern.',
      });
      complete = false;

      return;
    }

    if (step === notes) {
      issues.push({
        path: `${path}[${index}]`,
        message:
          'A step must give a working instruction rather than restate the pattern notes.',
      });
      complete = false;

      return;
    }

    seen.add(step);
    parsed.push(step);
  });

  return complete ? parsed : undefined;
}

function parsePattern(
  value: unknown,
  path: string,
  issues: Issues,
): SeedPatternInput | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({ path, message: 'Each pattern must be an object.' });

    return undefined;
  }

  rejectUnknownKeys(record, PATTERN_KEYS, `${path}.`, issues);

  const slug = parseSlug(record.slug, `${path}.slug`, issues);
  const title = parseText(
    record.title,
    `${path}.title`,
    'title',
    TITLE_LENGTH,
    issues,
  );
  const notes = parseNotes(record.notes, `${path}.notes`, issues);
  const steps = parseSteps(record.steps, notes, `${path}.steps`, issues);

  if (
    slug === undefined ||
    title === undefined ||
    notes === undefined ||
    steps === undefined
  ) {
    return undefined;
  }

  // Rebuilt key by key in a fixed order, so the normalized document is
  // independent of key order and formatting in the committed file.
  return { slug, title, notes, steps };
}

function parsePatterns(
  value: unknown,
  issues: Issues,
): readonly SeedPatternInput[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      path: 'patterns',
      message: 'patterns must be an array of pattern records.',
    });

    return undefined;
  }

  if (value.length < PATTERN_COUNT.min || value.length > PATTERN_COUNT.max) {
    issues.push({
      path: 'patterns',
      message: `patterns must hold ${PATTERN_COUNT.min}-${PATTERN_COUNT.max} records; received ${value.length}.`,
    });

    return undefined;
  }

  const parsed: SeedPatternInput[] = [];
  const slugs = new Set<string>();
  const titles = new Set<string>();
  const stepLists = new Set<string>();
  let complete = true;

  value.forEach((entry, index) => {
    const path = `patterns[${index}]`;
    const record = parsePattern(entry, path, issues);
    if (record === undefined) {
      complete = false;

      return;
    }

    if (slugs.has(record.slug)) {
      issues.push({
        path: `${path}.slug`,
        message:
          'slug is already used by an earlier record; seed identity must be unique.',
      });
      complete = false;
    } else {
      slugs.add(record.slug);
    }

    const title = record.title.toLowerCase();
    if (titles.has(title)) {
      issues.push({
        path: `${path}.title`,
        message:
          'title is already used by an earlier record, which would make two library rows read identically.',
      });
      complete = false;
    } else {
      titles.add(title);
    }

    const steps = JSON.stringify(record.steps);
    if (stepLists.has(steps)) {
      issues.push({
        path: `${path}.steps`,
        message:
          'These steps duplicate another record, which reads as a copied stub.',
      });
      complete = false;
    } else {
      stepLists.add(steps);
    }

    parsed.push(record);
  });

  return complete ? parsed : undefined;
}

/**
 * Validates bundled content against the documented format, collecting every
 * issue. Nothing passed in is mutated; the result is rebuilt from scratch.
 */
export function parsePatternSeedDocument(
  input: unknown,
): PatternSeedParseResult {
  const record = asRecord(input);
  if (record === undefined) {
    return {
      ok: false,
      issues: [{ path: '', message: 'The seed document must be a JSON object.' }],
    };
  }

  const issues: Issues = [];

  rejectUnknownKeys(record, DOCUMENT_KEYS, '', issues);

  const seedVersion = parseSeedVersion(record.seedVersion, issues);
  const terminology = parseTerminology(record.terminology, issues);
  const patterns = parsePatterns(record.patterns, issues);

  if (
    issues.length > 0 ||
    seedVersion === undefined ||
    terminology === undefined ||
    patterns === undefined
  ) {
    return { ok: false, issues };
  }

  return { ok: true, document: { seedVersion, terminology, patterns } };
}
