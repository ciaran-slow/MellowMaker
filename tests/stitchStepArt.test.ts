/** @jest-environment node */

import rawSeed from '@/data/seed/stitchSeed.json';
import { parseStitchSeedDocument } from '@/data/seed/stitchSeedDocument';
import {
  STITCH_ART_VIEWBOX,
  STITCH_STEP_ART,
  STROKE_COLOR,
  stitchStepArt,
  type StitchArtStroke,
} from '@/features/dictionary/presentation/stitchStepArt';

/**
 * Issue #46: the authored path data, checked as data. Everything here is pure —
 * no renderer, no Reanimated — so a fault in the geometry is reported as a fault
 * in the geometry rather than as a component failure.
 */

/** Only these commands are authored; `A`'s flag arguments would break the pair-wise coordinate parse. */
const PATH_SYNTAX = /^M[\sMLCQAZ0-9.,\-]*$/i;
const FORBIDDEN = ['url(', 'http', 'data:'];

function coordinates(d: string): readonly (readonly [number, number])[] {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const pairs: [number, number][] = [];

  for (let index = 0; index + 1 < numbers.length; index += 2) {
    pairs.push([numbers[index]!, numbers[index + 1]!]);
  }

  return pairs;
}

/**
 * Straight-line distance summed between consecutive parsed points. For a
 * polyline it is the exact length; for a curve it walks the control polygon, so
 * it is never shorter than the path it bounds. Computed here, independently of
 * the authored `length`, so the two can disagree.
 */
function chordLength(d: string): number {
  const points = coordinates(d);
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(
      points[index]![0] - points[index - 1]![0],
      points[index]![1] - points[index - 1]![1],
    );
  }

  return total;
}

const seed = parseStitchSeedDocument(rawSeed);
const singleCrochet = STITCH_STEP_ART['single-crochet'] ?? [];
const allStrokes: readonly StitchArtStroke[] = Object.values(
  STITCH_STEP_ART,
).flatMap((steps) => steps.flatMap((step) => [...step.base, step.draw]));

describe('stitch step art', () => {
  it('is scoped to the one spiked stitch', () => {
    // The spike measures a single stitch. A twelfth cannot arrive silently.
    expect(Object.keys(STITCH_STEP_ART)).toStrictEqual(['single-crochet']);
  });

  it('authors one drawing per seeded single-crochet step', () => {
    expect(singleCrochet).toHaveLength(5);

    if (!seed.ok) {
      throw new Error('The bundled stitch seed no longer parses.');
    }

    const seeded = seed.document.stitches.find(
      (stitch) => stitch.slug === 'single-crochet',
    );
    // Cross-checked against the shipped content, so adding or removing a seed
    // step without re-authoring the art fails here rather than rendering a
    // sentence with no drawing (or a drawing with no sentence).
    expect(singleCrochet).toHaveLength(seeded?.instructions.length ?? 0);
  });

  it('walks a non-trivial set of strokes (guard is not vacuous)', () => {
    expect(allStrokes.length).toBeGreaterThan(15);
  });

  it('draws every stroke with the authored command set and no external reference', () => {
    const offenders = allStrokes
      .filter(
        (stroke) =>
          !PATH_SYNTAX.test(stroke.d) ||
          FORBIDDEN.some((token) => stroke.d.includes(token)),
      )
      .map((stroke) => stroke.d);

    expect(offenders).toStrictEqual([]);
  });

  it('keeps every coordinate inside the authoring canvas', () => {
    const offenders: string[] = [];

    for (const stroke of allStrokes) {
      for (const [x, y] of coordinates(stroke.d)) {
        if (
          x < 0 ||
          x > STITCH_ART_VIEWBOX.width ||
          y < 0 ||
          y > STITCH_ART_VIEWBOX.height
        ) {
          // Off-canvas art renders clipped or entirely invisible on device.
          offenders.push(`${stroke.d}: (${x}, ${y})`);
        }
      }
    }

    expect(offenders).toStrictEqual([]);
  });

  it('bounds every authored length against an independently computed chord length', () => {
    const offenders: string[] = [];

    for (const step of singleCrochet) {
      const chord = chordLength(step.draw.d);
      // Too small breaks the dash — the stroke shows partly drawn at the first
      // frame. Wildly large spends the start of the animation on an invisible
      // stroke.
      if (step.draw.length < chord || step.draw.length > 3 * chord) {
        offenders.push(
          `${step.draw.d}: length ${step.draw.length} vs chord ${chord.toFixed(2)}`,
        );
      }
    }

    expect(offenders).toStrictEqual([]);
  });

  it('non-tautology: chordLength measures a known path exactly', () => {
    expect(chordLength('M 0 0 L 3 4')).toBe(5);
    expect(chordLength('M 0 0 L 3 4 L 3 4')).toBe(5);
  });

  it('names only roles the palette can colour', () => {
    const offenders = allStrokes
      .filter((stroke) => !(stroke.role in STROKE_COLOR))
      .map((stroke) => stroke.role);

    expect(offenders).toStrictEqual([]);
  });

  it('resolves art by slug and position, and returns nothing when none is authored', () => {
    expect(stitchStepArt('single-crochet', 0)).toBe(singleCrochet[0]);
    expect(stitchStepArt('single-crochet', 4)).toBe(singleCrochet[4]);

    // A maker-owned stitch has no slug at all; a bundled stitch without
    // authored art and an out-of-range step are equally absent. There is no
    // placeholder for any of the three.
    expect(stitchStepArt(undefined, 0)).toBeUndefined();
    expect(stitchStepArt('chain', 0)).toBeUndefined();
    expect(stitchStepArt('single-crochet', 5)).toBeUndefined();
  });
});
