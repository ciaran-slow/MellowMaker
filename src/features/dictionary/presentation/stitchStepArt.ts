import tokens from '@/ui/theme/tokens.json';

/**
 * Project-authored motion geometry for the stitch dictionary's step drawings.
 *
 * This is **presentation, not content**: the path strings are drawn for this
 * repository from the authored instruction sentences, they are never third-party
 * imagery, and they deliberately do not live in `src/data/seed` (feature code may
 * not import concrete data adapters) nor under `assets/` (which would put them
 * inside the bundled-imagery gate). `imageAssetKey` stays unset on every record.
 *
 * Nothing here is fetched, required from a file, or read from disk — the strings
 * are constants in the JS bundle, so the drawings render identically offline.
 *
 * Issue #46 is a **spike**: exactly one stitch is authored, and a test pins that.
 */

export type StrokeRole = 'base' | 'yarn' | 'hook';

export interface StitchArtStroke {
  readonly d: string;
  readonly role: StrokeRole;
}

export interface StitchArtDrawStroke extends StitchArtStroke {
  /**
   * The authored path length, rounded up. It drives both `strokeDasharray` and
   * the initial `strokeDashoffset`, so it must never be shorter than the path:
   * a short value leaves the stroke partly drawn at the first frame.
   */
  readonly length: number;
}

export interface StitchStepArt {
  /** Drawn immediately and never animated: the state the step starts from. */
  readonly base: readonly StitchArtStroke[];
  /** Exactly one stroke draws on per step. */
  readonly draw: StitchArtDrawStroke;
}

/** The authoring canvas every path is drawn inside. */
export const STITCH_ART_VIEWBOX = { width: 120, height: 84 } as const;
/** Caps the drawing on a wide screen so it stays beside its sentence, not over it. */
export const STITCH_ART_MAX_WIDTH = 320;
export const BASE_STROKE_WIDTH = 3;
export const DRAW_STROKE_WIDTH = 4;

/**
 * Stroke colours are token-only and measured: every value clears the 3:1
 * non-text threshold against both the white card (`#FFFFFF`) and the off-white
 * backdrop (`#F9F8F6`). The bright accents (`pink`, `teal`, `yellow`) do not and
 * are excluded by measurement, not by convention —
 * `tests/accessibilityContrast.test.ts` holds both halves of that.
 */
export const STROKE_COLOR: Readonly<Record<StrokeRole, string>> = {
  base: tokens.colors.ink, // #26547C — 7.95:1 on #FFFFFF
  yarn: tokens.colors.pinkStrong, // #C15169 — 4.52:1
  hook: tokens.colors.blueStrong, // #1080A6 — 4.51:1
};

/** The worked fabric edge the stitch is made into. */
const FABRIC_ROW = 'M 8 72 Q 24 62 40 72 Q 56 82 72 72 Q 88 62 104 72';
/** The two top loops of the next stitch, as one `d` with two subpaths. */
const TOP_LOOPS = 'M 60 70 Q 72 58 84 70 M 63 66 Q 72 57 81 66';
/** The hook, once it has been inserted and is no longer the thing being drawn. */
const HOOK = 'M 104 12 L 84 40 Q 76 51 74 62 Q 73 68 68 66 Q 64 64 66 60';
/** The loop drawn up through the stitch in step 2. */
const FIRST_LOOP = 'M 8 30 Q 32 18 56 28 Q 70 34 66 44 Q 62 54 72 52 Q 82 50 80 38';
/** The finished single-crochet post, once step 4 has completed it. */
const FINISHED_POST = 'M 62 70 L 62 48 Q 62 40 72 40 Q 82 40 82 48 L 82 70';

/**
 * Single crochet, one entry per authored sentence and in the same order. Each
 * step's `base` is the previous step's accumulated result, so the five drawings
 * read as one continuous stitch rather than five unrelated sketches.
 */
const SINGLE_CROCHET: readonly StitchStepArt[] = [
  // 1. Insert the hook front to back under both top loops of the next stitch.
  {
    base: [
      { d: FABRIC_ROW, role: 'base' },
      { d: TOP_LOOPS, role: 'base' },
    ],
    draw: { d: HOOK, length: 80, role: 'hook' },
  },
  // 2. Yarn over and draw a loop back through, leaving two loops on the hook.
  {
    base: [
      { d: FABRIC_ROW, role: 'base' },
      { d: TOP_LOOPS, role: 'base' },
      { d: HOOK, role: 'hook' },
    ],
    draw: { d: FIRST_LOOP, length: 123, role: 'yarn' },
  },
  // 3. Yarn over again and draw through both loops on the hook.
  {
    base: [
      { d: FABRIC_ROW, role: 'base' },
      { d: TOP_LOOPS, role: 'base' },
      { d: HOOK, role: 'hook' },
      { d: FIRST_LOOP, role: 'yarn' },
    ],
    draw: {
      d: 'M 10 46 Q 34 40 54 34 Q 66 30 70 20 Q 74 10 86 16 Q 96 21 90 30',
      length: 116,
      role: 'yarn',
    },
  },
  // 4. One loop remains, and the finished stitch stands a single loop tall.
  {
    base: [
      { d: FABRIC_ROW, role: 'base' },
      { d: TOP_LOOPS, role: 'base' },
    ],
    draw: { d: FINISHED_POST, length: 80, role: 'yarn' },
  },
  // 5. At the end of a row, chain one and turn before working the next row.
  {
    base: [
      { d: FABRIC_ROW, role: 'base' },
      { d: TOP_LOOPS, role: 'base' },
      { d: FINISHED_POST, role: 'base' },
    ],
    draw: {
      d: 'M 72 40 Q 64 30 72 22 Q 82 14 92 22 Q 100 29 92 36 Q 102 32 106 20',
      length: 95,
      role: 'yarn',
    },
  },
];

/**
 * Every stitch with authored step art, keyed by seed slug. The spike ships
 * exactly one; a twelfth stitch cannot arrive without updating the test that
 * pins these keys.
 */
export const STITCH_STEP_ART: Readonly<
  Record<string, readonly StitchStepArt[]>
> = {
  'single-crochet': SINGLE_CROCHET,
};

/**
 * The art for one step, or `undefined` when none is authored — an unknown slug,
 * a maker-owned stitch (which has no slug at all), or a position past the
 * authored set. Absence is the whole "no art" path: there is no placeholder.
 */
export function stitchStepArt(
  slug: string | undefined,
  position: number,
): StitchStepArt | undefined {
  if (slug === undefined) {
    return undefined;
  }

  return STITCH_STEP_ART[slug]?.[position];
}
