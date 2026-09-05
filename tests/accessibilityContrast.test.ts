import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { STROKE_COLOR } from '@/features/dictionary/presentation/stitchStepArt';
import tokens from '@/ui/theme/tokens.json';

import { contrastRatio } from './support/contrast';

/**
 * Issue #14 (A11Y-04): the app-wide contrast guard that was missing. Before it,
 * `contrastRatio` was asserted in two isolated spots and a 2.01:1 button reached
 * `main`. Walk-based (the #12 idiom): every `.tsx` under `src/` is scanned by
 * default, so a new file cannot pair a bright accent with text and escape.
 *
 * The rule the palette decision fixed: the bright Playful Craft accents (pink,
 * teal, blue) are decorative only — never a text surface and never a text
 * colour. Anything that carries text or a selection indicator on an accent uses
 * the `*Strong` companion token, which clears 4.5:1 with white text and 3:1
 * against the off-white background.
 */

const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.join(repoRoot, 'src');
const colors: Record<string, string> = tokens.colors;

const TEXT_AA = 4.5;
const NON_TEXT_AA = 3;

/** Bright accents may never be a background — nothing legible fits on them. */
const BRIGHT_BG = /\bbg-(pink|teal|blue)\b/;
/** Bright accents (and yellow) fail as text on white/off-white surfaces. */
const BRIGHT_TEXT = /\btext-(pink|teal|blue|yellow)\b/;
/**
 * Every string literal, not only `className="…"` attributes: status-pill and
 * variant maps hold their classes in object literals (e.g. `'bg-tealStrong
 * text-surface'`), and one of the four original failures lived exactly there.
 */
const STRING_LITERAL = /'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g;
const PRESSABLE_SPAN = /<CraftPressable\b[\s\S]*?<\/CraftPressable>/g;
/**
 * An SVG stroke or fill sits on a card, not on a token background, so none of
 * the class-based rules above can see it. A raw hex is the way one would escape
 * the palette entirely, so it is banned outright: every stroke colour must come
 * from `STROKE_COLOR`, which is measured below (issue #46).
 */
const RAW_STROKE_HEX = /(?:stroke|fill)=\s*[{"']?\s*['"]?#/;
/**
 * The adjacent form above only catches a hex written *at* the attribute. A hex
 * behind a local constant, a role→hex map, or a ternary reaches the same stroke
 * and slips straight past it. So any file that strokes or fills at all is
 * additionally forbidden a raw colour anywhere in it: the palette lookup has to
 * come from a token module, which is measured separately.
 */
const STROKES_OR_FILLS = /(?:stroke|fill)=/;
const HEX_LITERAL = /#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})\b/;
/**
 * Both rules above are about a *hex*, and a hex is only the loudest carrier.
 * A future component that strokes SVG art with a colour **imported from another
 * module** escapes them completely: the file it lives in holds no hex at all, so
 * the file-level rule never arms, and the literal-palette pin in
 * `StitchStepAnimation.test.tsx` reads only that one component's output (verify
 * finding on PR #55, issue #46). So the value itself is enumerated: every
 * `stroke=`/`fill=` in `src/` must resolve through the measured palette or be
 * `"none"`. A bare identifier — `stroke={brandColour}` — is red by construction,
 * which is the point: it forces the colour back through `STROKE_COLOR`, where
 * the 3:1 measurement below actually applies.
 */
const STROKE_OR_FILL_VALUE =
  /(?<![A-Za-z])(?:stroke|fill)=(?:"([^"\n]*)"|'([^'\n]*)'|\{([^{}]*)\})/g;
/** `"none"`, a `STROKE_COLOR` role lookup, or a `tokens.colors.*` reference. */
const RESOLVED_STROKE_VALUE =
  /^\s*(?:none|'none'|"none"|STROKE_COLOR\[[^\]]+\]|STROKE_COLOR\.[A-Za-z0-9_]+|tokens\.colors\.[A-Za-z0-9_]+)\s*$/;

/** Every `stroke=`/`fill=` attribute written in one source file, as text. */
function strokeAndFillValues(source: string): string[] {
  return [...source.matchAll(STROKE_OR_FILL_VALUE)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? '',
  );
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(full);
    }

    return /\.tsx$/.test(entry.name) ? [full] : [];
  });
}

const sourceFiles = walk(srcDir);
const rel = (file: string) => path.relative(repoRoot, file);

function tokensIn(source: string, prefix: 'bg' | 'text'): string[] {
  const matches = source.matchAll(new RegExp(`\\b${prefix}-([A-Za-z]+)\\b`, 'g'));

  return [...matches].map((m) => m[1]!).filter((name) => name in colors);
}

function iconTokensIn(source: string): string[] {
  return [...source.matchAll(/tokens\.colors\.([A-Za-z]+)/g)]
    .map((m) => m[1]!)
    .filter((name) => name in colors);
}

describe('accessibility contrast guard (A11Y-04)', () => {
  it('walks a non-trivial set of presentation files (guard is not vacuous)', () => {
    expect(sourceFiles.length).toBeGreaterThan(30);
  });

  it('never uses a bright accent as a background anywhere in src/', () => {
    const offenders = sourceFiles
      .filter((file) => BRIGHT_BG.test(readFileSync(file, 'utf8')))
      .map(rel);

    expect(offenders).toStrictEqual([]);
  });

  it('never uses a bright accent as a text colour anywhere in src/', () => {
    const offenders = sourceFiles
      .filter((file) => BRIGHT_TEXT.test(readFileSync(file, 'utf8')))
      .map(rel);

    expect(offenders).toStrictEqual([]);
  });

  it('every string literal pairing a token background with a token text colour clears 4.5:1', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(STRING_LITERAL)) {
        const value = match[1] ?? match[2] ?? match[3] ?? '';
        // A conditional class list is a set of branches, not one pairing;
        // its branches are asserted explicitly below rather than guessed at.
        if (value.includes('${')) {
          continue;
        }

        for (const bg of tokensIn(value, 'bg')) {
          for (const text of tokensIn(value, 'text')) {
            const ratio = contrastRatio(colors[text]!, colors[bg]!);
            if (ratio < TEXT_AA) {
              offenders.push(
                `${rel(file)}: text-${text} on bg-${bg} = ${ratio.toFixed(2)}:1`,
              );
            }
          }
        }
      }
    }

    expect(offenders).toStrictEqual([]);
  });

  it('every CraftPressable with a token background hosts only legible text and icons', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(PRESSABLE_SPAN)) {
        const span = match[0];
        const head = span.slice(0, span.indexOf('>'));
        if (head.includes('${')) {
          continue;
        }

        const [bg] = tokensIn(head, 'bg');
        if (bg === undefined) {
          continue;
        }

        for (const text of tokensIn(span, 'text')) {
          const ratio = contrastRatio(colors[text]!, colors[bg]!);
          if (ratio < TEXT_AA) {
            offenders.push(
              `${rel(file)}: text-${text} inside bg-${bg} = ${ratio.toFixed(2)}:1`,
            );
          }
        }
        for (const icon of iconTokensIn(span)) {
          const ratio = contrastRatio(colors[icon]!, colors[bg]!);
          if (ratio < NON_TEXT_AA) {
            offenders.push(
              `${rel(file)}: icon ${icon} inside bg-${bg} = ${ratio.toFixed(2)}:1`,
            );
          }
        }
      }
    }

    expect(offenders).toStrictEqual([]);
  });

  it('CraftConfirmDialog keeps both confirm branches legible', () => {
    // The one conditional class list the walks skip: destructive → strong pink
    // with white text; otherwise yellow with ink. Both branches asserted.
    const source = readFileSync(
      path.join(srcDir, 'ui/components/CraftConfirmDialog.tsx'),
      'utf8',
    );
    expect(source).toContain("destructive ? 'bg-pinkStrong' : 'bg-yellow'");
    expect(source).toContain("destructive ? 'text-surface' : 'text-ink'");
    expect(contrastRatio(colors.surface!, colors.pinkStrong!)).toBeGreaterThanOrEqual(
      TEXT_AA,
    );
    expect(contrastRatio(colors.ink!, colors.yellow!)).toBeGreaterThanOrEqual(TEXT_AA);
  });

  it('pins the strong accent tokens to their documented values and thresholds', () => {
    // Literal hexes and thresholds — not re-derived from tokens.json — so a
    // drift in the token file is caught here rather than silently accepted.
    expect(colors.pinkStrong).toBe('#C15169');
    expect(colors.tealStrong).toBe('#048765');
    expect(colors.blueStrong).toBe('#1080A6');

    for (const strong of ['#C15169', '#048765', '#1080A6']) {
      expect(contrastRatio('#FFFFFF', strong)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(strong, '#F9F8F6')).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the bright accents exactly as vision.md documents them', () => {
    expect(colors.pink).toBe('#FF6B8B');
    expect(colors.teal).toBe('#06D6A0');
    expect(colors.blue).toBe('#118AB2');
    expect(colors.yellow).toBe('#FFD166');
  });

  it('every stitch-art stroke colour clears 3:1 on both the card and the backdrop', () => {
    // Non-text graphics, so the 3:1 threshold applies rather than 4.5:1. The
    // drawings sit on white cards, which themselves sit on the off-white
    // backdrop, so both surfaces are asserted with literal hexes.
    const offenders: string[] = [];

    for (const [role, value] of Object.entries(STROKE_COLOR)) {
      for (const surface of ['#FFFFFF', '#F9F8F6']) {
        const ratio = contrastRatio(value, surface);
        if (ratio < NON_TEXT_AA) {
          offenders.push(`${role} ${value} on ${surface} = ${ratio.toFixed(2)}:1`);
        }
      }

      // A raw colour cannot be smuggled into the palette map either.
      if (!Object.values(colors).includes(value)) {
        offenders.push(`${role} ${value} is not a documented token colour`);
      }
    }

    expect(offenders).toStrictEqual([]);
  });

  it('never writes a raw colour into a stroke or fill anywhere in src/', () => {
    const offenders = sourceFiles
      .filter((file) => RAW_STROKE_HEX.test(readFileSync(file, 'utf8')))
      .map(rel);

    expect(offenders).toStrictEqual([]);
  });

  it('holds no raw colour at all in any file that strokes or fills', () => {
    const offenders = sourceFiles
      .filter((file) => {
        const source = readFileSync(file, 'utf8');

        return STROKES_OR_FILLS.test(source) && HEX_LITERAL.test(source);
      })
      .map(rel);

    expect(offenders).toStrictEqual([]);
  });

  it('resolves every stroke and fill in src/ through the measured palette', () => {
    // Closes the carrier the hex rules cannot see: a colour imported from
    // another module carries no hex into the file that strokes with it.
    const offenders = sourceFiles.flatMap((file) =>
      strokeAndFillValues(readFileSync(file, 'utf8'))
        .filter((value) => !RESOLVED_STROKE_VALUE.test(value))
        .map((value) => `${rel(file)}: ${value}`),
    );

    expect(offenders).toStrictEqual([]);
  });

  it('non-tautology: the stroke-value rule sees the real attributes and rejects an import', () => {
    // It actually finds the attributes that exist today, rather than passing
    // over an empty set.
    const found = sourceFiles.flatMap((file) =>
      strokeAndFillValues(readFileSync(file, 'utf8')),
    );

    expect(found).toContain('none');
    expect(found).toContain('STROKE_COLOR[stroke.role]');

    // The forms that must pass.
    expect(RESOLVED_STROKE_VALUE.test('none')).toBe(true);
    expect(RESOLVED_STROKE_VALUE.test('STROKE_COLOR[art.draw.role]')).toBe(true);
    expect(RESOLVED_STROKE_VALUE.test('tokens.colors.pinkStrong')).toBe(true);

    // The carriers that must fail — an imported constant, a foreign map, a
    // prop, and a ternary that never reaches the palette.
    expect(RESOLVED_STROKE_VALUE.test('brandColour')).toBe(false);
    expect(RESOLVED_STROKE_VALUE.test('PALETTE.hook')).toBe(false);
    expect(RESOLVED_STROKE_VALUE.test('props.color')).toBe(false);
    expect(RESOLVED_STROKE_VALUE.test("active ? accent : 'grey'")).toBe(false);

    // And the extractor reads the value, not the whole attribute, on both the
    // string and the expression form.
    expect(strokeAndFillValues('<Path fill="none" stroke={x} />')).toStrictEqual([
      'none',
      'x',
    ]);
    // Neighbouring `stroke*` props are not stroke colours and must not be read.
    expect(
      strokeAndFillValues('<Path strokeWidth={3} strokeLinecap="round" />'),
    ).toStrictEqual([]);
  });

  it('non-tautology: the stroke rules reject a raw hex and a bright accent', () => {
    // The matcher catches the hex form and lets the palette lookup through.
    expect(RAW_STROKE_HEX.test('stroke="#FF6B8B"')).toBe(true);
    expect(RAW_STROKE_HEX.test('fill={"#FFD166"}')).toBe(true);
    expect(RAW_STROKE_HEX.test('stroke={STROKE_COLOR[stroke.role]}')).toBe(false);
    expect(RAW_STROKE_HEX.test('fill="none"')).toBe(false);
    expect(RAW_STROKE_HEX.test('strokeWidth={3}')).toBe(false);

    // The file-level rule arms on the palette-correct form too — that is the
    // point: it is what closes the constant / map / ternary carriers the
    // adjacent matcher above cannot see.
    expect(STROKES_OR_FILLS.test('stroke={STROKE_COLOR[stroke.role]}')).toBe(true);
    expect(HEX_LITERAL.test("const RAW = '#FFD166';")).toBe(true);
    expect(HEX_LITERAL.test("{ base: '#FFD166' }")).toBe(true);
    expect(HEX_LITERAL.test("role === 'base' ? '#FFD166' : palette")).toBe(true);
    expect(HEX_LITERAL.test('importantForAccessibility="no-hide-descendants"')).toBe(
      false,
    );

    // And the 3:1 threshold is a real constraint: the bright teal and yellow
    // would fail it, so passing it is not automatic for any palette colour.
    expect(contrastRatio('#06D6A0', '#FFFFFF')).toBeLessThan(NON_TEXT_AA);
    expect(contrastRatio('#FFD166', '#FFFFFF')).toBeLessThan(NON_TEXT_AA);
  });

  it('non-tautology: a bright accent under ink text would fail the pairing rule', () => {
    expect(BRIGHT_BG.test('className="items-center bg-pink px-6 py-3"')).toBe(true);
    expect(BRIGHT_TEXT.test('className="text-label text-pink"')).toBe(true);
    expect(contrastRatio(colors.ink!, colors.pink!)).toBeLessThan(TEXT_AA);
    expect(contrastRatio(colors.ink!, colors.blue!)).toBeLessThan(TEXT_AA);
    expect(contrastRatio(colors.ink!, colors.teal!)).toBeLessThan(TEXT_AA);
    expect(contrastRatio(colors.surface!, colors.blue!)).toBeLessThan(TEXT_AA);
    // The strong companion is not matched by the bright-accent matcher.
    expect(BRIGHT_BG.test('bg-pinkStrong')).toBe(false);
    expect(BRIGHT_TEXT.test('text-pinkStrong')).toBe(false);
  });
});
