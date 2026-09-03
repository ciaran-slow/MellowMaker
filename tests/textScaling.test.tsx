import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react-native';

import { GuideViewerStepRow } from '@/features/guides/presentation/GuideViewerStepRow';
import { PatternViewerStepRow } from '@/features/patterns/presentation/PatternViewerStepRow';

/**
 * Issue #14 (A11Y-05 / UX-03): the text-scaling policy. Essential text — step
 * instructions, notes, the counter and its controls, error and empty bodies —
 * never clamps, so a maker on a large system text size reads the whole
 * instruction. Only list-row previews may clamp; the full text is one tap away.
 *
 * Walk-based (the #12 idiom): every `.tsx` under `src/` is scanned and defaults
 * to "no clamp allowed"; a file is exempt only by being on the explicit preview
 * allowlist, which is itself asserted to be live.
 */

const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.join(repoRoot, 'src');

/** The only surfaces allowed a `numberOfLines` clamp: list-row previews. */
const PREVIEW_ROWS: readonly string[] = [
  'src/features/dictionary/presentation/StitchListRow.tsx',
  'src/features/patterns/presentation/PatternListRow.tsx',
  'src/features/guides/presentation/GuideListRow.tsx',
].map((p) => path.join(repoRoot, p));

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

const LONG_INSTRUCTION =
  'Chain 20, then work one single crochet into the second chain from the hook and into each remaining chain across the row; turn, chain one, and repeat the single crochet row until the piece measures the full scarf length, keeping the edges straight by counting twenty stitches on every row before you turn.';

describe('text scaling policy (A11Y-05)', () => {
  it('walks a non-trivial set of presentation files (guard is not vacuous)', () => {
    expect(sourceFiles.length).toBeGreaterThan(30);
  });

  it('clamps text only on list-row previews', () => {
    const offenders = sourceFiles
      .filter((file) => !PREVIEW_ROWS.includes(file))
      .filter((file) => /\bnumberOfLines\b/.test(readFileSync(file, 'utf8')))
      .map(rel);

    expect(offenders).toStrictEqual([]);
  });

  it('keeps the preview allowlist live (no stale or renamed entry)', () => {
    const present = new Set(sourceFiles);
    expect(PREVIEW_ROWS.filter((file) => !present.has(file))).toStrictEqual([]);
  });

  it('never disables or caps system font scaling', () => {
    const offenders = sourceFiles
      .filter((file) =>
        /allowFontScaling=\{false\}|maxFontSizeMultiplier/.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map(rel);

    expect(offenders).toStrictEqual([]);
  });

  it('renders a long pattern step instruction in full', async () => {
    expect(LONG_INSTRUCTION.length).toBeGreaterThan(300);
    await render(
      <PatternViewerStepRow
        onComplete={jest.fn()}
        onReopen={jest.fn()}
        onSelect={jest.fn()}
        step={{ id: 's1', index: 0, instruction: LONG_INSTRUCTION, status: 'current' }}
        total={1}
      />,
    );

    const instruction = screen.getByText(LONG_INSTRUCTION);
    expect(instruction).toBeOnTheScreen();
    expect(instruction.props.numberOfLines).toBeUndefined();
  });

  it('renders a long guide step instruction, transcript, and note in full', async () => {
    const note = `Note: ${LONG_INSTRUCTION}`;
    await render(
      <GuideViewerStepRow
        note={note}
        onComplete={jest.fn()}
        onReopen={jest.fn()}
        step={{ id: 'g1', index: 0, instruction: LONG_INSTRUCTION, status: 'todo' }}
        total={1}
        transcriptExcerpt={LONG_INSTRUCTION}
        videoOffsetMs={undefined}
      />,
    );

    for (const text of [LONG_INSTRUCTION, note]) {
      const rendered = screen.getAllByText(text);
      expect(rendered.length).toBeGreaterThan(0);
      for (const element of rendered) {
        expect(element.props.numberOfLines).toBeUndefined();
      }
    }
  });
});
