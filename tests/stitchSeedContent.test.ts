/** @jest-environment node */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import rawSeed from '@/data/seed/stitchSeed.json';
import { parseStitchSeedDocument } from '@/data/seed/stitchSeedDocument';

const REPOSITORY_ROOT = join(__dirname, '..');
const PROVENANCE_PATH = join(REPOSITORY_ROOT, 'docs', 'content-provenance.md');

/**
 * Hand-written, in document order, and deliberately not derived from the content
 * it checks: `[slug, name, abbreviation, difficulty, instructionCount]`. A
 * renamed stitch, a mistyped abbreviation, a wrong difficulty, a dropped step, a
 * reordered document, or a thirteenth record fails here.
 */
const EXPECTED: readonly (readonly [
  string,
  string,
  string,
  string,
  number,
])[] = [
  ['chain', 'Chain', 'ch', 'beginner', 5],
  ['slip-stitch', 'Slip stitch', 'sl st', 'beginner', 5],
  ['single-crochet', 'Single crochet', 'sc', 'beginner', 5],
  ['half-double-crochet', 'Half double crochet', 'hdc', 'beginner', 6],
  ['double-crochet', 'Double crochet', 'dc', 'beginner', 5],
  ['treble-crochet', 'Treble crochet', 'tr', 'intermediate', 6],
  [
    'single-crochet-increase',
    'Single crochet increase',
    'inc',
    'intermediate',
    5,
  ],
  [
    'single-crochet-two-together',
    'Single crochet two together',
    'sc2tog',
    'intermediate',
    5,
  ],
  [
    'double-crochet-two-together',
    'Double crochet two together',
    'dc2tog',
    'intermediate',
    5,
  ],
  ['back-loop-only', 'Back loop only', 'BLO', 'intermediate', 5],
  ['magic-ring', 'Magic ring', 'MR', 'intermediate', 5],
  ['fasten-off', 'Fasten off', 'FO', 'beginner', 5],
];

/**
 * SHA-256 of the normalized document. This pins nothing about correctness — the
 * table above does that — and everything about review: any prose revision fails
 * until the author bumps `seedVersion` and updates `docs/content-provenance.md`,
 * which is the enforceable half of the update policy.
 */
const FINGERPRINT =
  '9c20f8de4510e63abdba45206a809a2acc85cf11e9b73680e0e4123e8ec86d68';

const result = parseStitchSeedDocument(rawSeed);

describe('committed stitch content', () => {
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
      document.stitches.map((stitch) => [
        stitch.slug,
        stitch.name,
        stitch.abbreviation,
        stitch.difficulty,
        stitch.instructions.length,
      ]),
    ).toStrictEqual(EXPECTED.map((entry) => [...entry]));
  });

  it('declares the PRD0 seed version and US terminology', () => {
    expect(document.seedVersion).toBe(1);
    expect(document.terminology).toBe('US');
  });

  it('meets every field rule of FR-ST-05 in the shipped bytes', () => {
    for (const stitch of document.stitches) {
      expect(stitch.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(stitch.name).toBe(stitch.name.trim());
      expect(stitch.abbreviation).toBe(stitch.abbreviation.trim());
      expect(stitch.summary).toBe(stitch.summary.trim());
      expect(stitch.summary.length).toBeGreaterThanOrEqual(20);
      expect(stitch.summary.length).toBeLessThanOrEqual(140);
      expect(stitch.instructions.length).toBeGreaterThanOrEqual(3);
      expect(stitch.instructions.length).toBeLessThanOrEqual(7);

      for (const step of stitch.instructions) {
        expect(step.instruction).toBe(step.instruction.trim());
        expect(step.instruction.length).toBeGreaterThanOrEqual(15);
        expect(step.instruction.length).toBeLessThanOrEqual(200);
      }
    }

    const slugs = document.stitches.map((stitch) => stitch.slug);
    const abbreviations = document.stitches.map((stitch) =>
      stitch.abbreviation.toLowerCase(),
    );

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(abbreviations).size).toBe(abbreviations.length);
  });

  it('stays inside the beginner-to-intermediate audience', () => {
    expect(document.stitches.map((stitch) => stitch.difficulty)).not.toContain(
      'advanced',
    );
    for (const stitch of document.stitches) {
      expect(['beginner', 'intermediate']).toContain(stitch.difficulty);
    }
  });

  it('bundles no imagery and no unlicensed asset', () => {
    for (const stitch of document.stitches) {
      for (const step of stitch.instructions) {
        expect('imageAssetKey' in step).toBe(false);
      }
    }

    const assets = readdirSync(join(REPOSITORY_ROOT, 'assets'));

    expect(assets).not.toContain('stitches');
    expect(assets.filter((entry) => entry.startsWith('stitch-'))).toStrictEqual(
      [],
    );
  });

  it('is covered row for row by the provenance record', () => {
    const provenance = readFileSync(PROVENANCE_PATH, 'utf8');
    const section = provenance.slice(
      provenance.indexOf('## 2.'),
      provenance.indexOf('## 3.'),
    );
    const recorded = [...section.matchAll(/^\| \d+ \| `([a-z0-9-]+)` \|/gm)].map(
      (match) => match[1],
    );

    expect([...recorded].sort()).toStrictEqual(
      document.stitches.map((stitch) => stitch.slug).sort(),
    );
  });

  it('matches the fingerprint recorded for its seed version', () => {
    const digest = createHash('sha256')
      .update(JSON.stringify(document))
      .digest('hex');

    expect(digest).toBe(FINGERPRINT);
    expect(readFileSync(PROVENANCE_PATH, 'utf8')).toContain(
      `| ${document.seedVersion} | PRD0 initial content set | \`${FINGERPRINT}\` |`,
    );
  });
});
