/** @jest-environment node */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import rawPatternSeed from '@/data/seed/patternSeed.json';
import { parsePatternSeedDocument } from '@/data/seed/patternSeedDocument';
import rawStitchSeed from '@/data/seed/stitchSeed.json';

const REPOSITORY_ROOT = join(__dirname, '..');
const PROVENANCE_PATH = join(REPOSITORY_ROOT, 'docs', 'content-provenance.md');

/**
 * Hand-written, in document order, and deliberately not derived from the content
 * it checks: `[slug, title, stepCount]`. A renamed pattern, a dropped step, a
 * reordered document, or a seventh record fails here.
 */
const EXPECTED: readonly (readonly [string, string, number])[] = [
  ['practice-swatch', 'Practice Swatch', 6],
  ['cotton-dishcloth', 'Cotton Dishcloth', 7],
  ['ridged-coaster', 'Ridged Coaster', 6],
  ['granny-square', 'Granny Square', 7],
  ['ribbed-headband', 'Ribbed Headband', 6],
  ['simple-scarf', 'Simple Scarf', 6],
];

/**
 * The abbreviations the starter set is allowed to lean on, written by hand. A
 * beginner must be able to look up every abbreviation the bundled patterns use,
 * so this set is asserted to equal — not merely be contained by — the set the
 * shipped steps actually use, measured against the bundled dictionary.
 */
const EXPECTED_ABBREVIATIONS: readonly string[] = [
  'BLO',
  'FO',
  'dc',
  'hdc',
  'sc',
  'sl st',
];

/**
 * SHA-256 of the normalized document. This pins nothing about correctness — the
 * table above does that — and everything about review: any prose revision fails
 * until the author records the new digest in `docs/content-provenance.md`, and,
 * once a version has shipped, bumps `seedVersion` too.
 */
const FINGERPRINT =
  'fdf32948783e1c6dd5cabd0c2b3c3b0f9a7b74842f18fd3901841fce3d35dac1';

/** Hand-written, so a dropped or added step fails both here and in the table. */
const TOTAL_STEPS = 38;
const TOTAL_STEPS_PROSE = 'Thirty-eight instruction steps in total.';

/** Case-sensitive whole-token match, so `dc` never matches inside `hdc`. */
function usesAbbreviation(text: string, abbreviation: string): boolean {
  const escaped = abbreviation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`).test(text);
}

const result = parsePatternSeedDocument(rawPatternSeed);

describe('committed pattern content', () => {
  it('validates against the documented format', () => {
    if (!result.ok) {
      throw new Error(
        `The bundled content is invalid:\n${result.issues
          .map((issue) => `  ${issue.path || '<document>'}: ${issue.message}`)
          .join('\n')}`,
      );
    }

    expect(result.ok).toBe(true);
  });

  if (!result.ok) {
    // The remaining assertions describe a valid document; the case above reports
    // every fault so one run names them all.
    return;
  }

  const { document } = result;

  it('ships exactly the approved set, in the approved order', () => {
    expect(
      document.patterns.map((pattern) => [
        pattern.slug,
        pattern.title,
        pattern.steps.length,
      ]),
    ).toStrictEqual(EXPECTED.map((entry) => [...entry]));
  });

  it('declares the first seed version and US terminology', () => {
    expect(document.seedVersion).toBe(1);
    expect(document.terminology).toBe('US');
  });

  it('meets every field rule in the shipped bytes', () => {
    for (const pattern of document.patterns) {
      expect(pattern.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(pattern.title).toBe(pattern.title.trim());
      expect(pattern.title.length).toBeGreaterThanOrEqual(2);
      expect(pattern.title.length).toBeLessThanOrEqual(60);
      expect(pattern.notes).toBe(pattern.notes.trim());
      expect(pattern.notes.length).toBeGreaterThanOrEqual(20);
      expect(pattern.notes.length).toBeLessThanOrEqual(200);
      // The issue's "hook size, yarn weight" requirement, made mechanical.
      expect(pattern.notes).toMatch(/\b\d+(\.\d+)?\s?mm\b/);
      expect(pattern.steps.length).toBeGreaterThanOrEqual(4);
      expect(pattern.steps.length).toBeLessThanOrEqual(12);

      for (const step of pattern.steps) {
        expect(step).toBe(step.trim());
        expect(step.length).toBeGreaterThanOrEqual(10);
        expect(step.length).toBeLessThanOrEqual(200);
      }

      expect(new Set(pattern.steps).size).toBe(pattern.steps.length);
    }

    const slugs = document.patterns.map((pattern) => pattern.slug);
    const titles = document.patterns.map((pattern) =>
      pattern.title.toLowerCase(),
    );

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('uses only abbreviations the bundled dictionary defines', () => {
    const bundledAbbreviations = rawStitchSeed.stitches.map(
      (stitch) => stitch.abbreviation,
    );
    const steps = document.patterns.flatMap((pattern) => [...pattern.steps]);

    // Falsifies in both directions: dropping the BLO ribbing step shrinks the
    // used set, and introducing an `inc` step the dictionary never explains in
    // a starter pattern grows it.
    expect(
      bundledAbbreviations
        .filter((abbreviation) =>
          steps.some((step) => usesAbbreviation(step, abbreviation)),
        )
        .sort(),
    ).toStrictEqual([...EXPECTED_ABBREVIATIONS].sort());
  });

  it('bundles no imagery', () => {
    // The documented format has no asset key at all, so a bundled image could
    // only arrive as a new file.
    for (const pattern of document.patterns) {
      expect(Object.keys(pattern).sort()).toStrictEqual([
        'notes',
        'slug',
        'steps',
        'title',
      ]);
    }

    const assets = readdirSync(join(REPOSITORY_ROOT, 'assets'));

    expect(assets).not.toContain('patterns');
    expect(assets.filter((entry) => entry.startsWith('pattern-'))).toStrictEqual(
      [],
    );
  });

  it('is covered row for row by the provenance record', () => {
    const provenance = readFileSync(PROVENANCE_PATH, 'utf8');
    const section = provenance.slice(
      provenance.indexOf('## 8.'),
      provenance.indexOf('## 9.'),
    );
    // Every column, not just the slug: a title or step count edited in one place
    // and not the other must fail rather than drift silently.
    const recorded = [
      ...section.matchAll(
        /^\| \d+ \| `([a-z0-9-]+)` \| ([^|]+?) \| (\d+) \|/gm,
      ),
    ].map((match) => [match[1], match[2], Number(match[3])]);

    expect(recorded).toStrictEqual(
      document.patterns.map((pattern) => [
        pattern.slug,
        pattern.title,
        pattern.steps.length,
      ]),
    );

    expect(
      document.patterns.reduce(
        (total, pattern) => total + pattern.steps.length,
        0,
      ),
    ).toBe(TOTAL_STEPS);
    expect(section).toContain(TOTAL_STEPS_PROSE);
  });

  it('matches the fingerprint recorded for its seed version', () => {
    const digest = createHash('sha256')
      .update(JSON.stringify(document))
      .digest('hex');

    expect(digest).toBe(FINGERPRINT);
    expect(readFileSync(PROVENANCE_PATH, 'utf8')).toMatch(
      new RegExp(
        `^\\| ${document.seedVersion} \\| [^|]+ \\| \`${FINGERPRINT}\` \\|$`,
        'm',
      ),
    );
  });
});
