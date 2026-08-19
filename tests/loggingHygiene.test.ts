import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Issue #13 (AC5 / NFR-12): logging hygiene. We cannot statically prove a runtime
 * value is "maker content", so we lock the stronger, checkable invariant that
 * production source under `src/` makes no direct `console.*` call — matching the
 * documented code-only-logger convention (architecture §12): any future
 * diagnostic seam logs error codes/ids/versions, never pattern text, notes, or
 * transcript excerpts.
 *
 * Walk-based (the #12 idiom): every `.ts`/`.tsx` under `src/` is scanned by
 * default, so a new file cannot introduce a `console.*` call that escapes the
 * guard. Scope is `src/` only — tests and `scripts/` may log intentionally.
 */

const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.join(repoRoot, 'src');

const CONSOLE_CALL =
  /\bconsole\s*\.\s*(log|info|warn|error|debug|trace|dir|table)\b/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(full);
    }

    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const sourceFiles = walk(srcDir);

describe('logging hygiene: no console.* in src/', () => {
  it('walks a non-trivial set of source files (guard is not vacuous)', () => {
    expect(sourceFiles.length).toBeGreaterThan(30);
  });

  it('finds no direct console.* call in production source', () => {
    const offenders = sourceFiles
      .filter((file) => CONSOLE_CALL.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(repoRoot, file));

    expect(offenders).toStrictEqual([]);
  });

  it('non-tautology: the matcher trips on a synthetic offender', () => {
    // Proves the guard would catch a real console call logging maker content.
    expect(CONSOLE_CALL.test('console.log(pattern.notes)')).toBe(true);
    expect(CONSOLE_CALL.test('console.error(step.transcriptExcerpt)')).toBe(
      true,
    );
    // A benign identifier that merely contains "console" does not trip.
    expect(CONSOLE_CALL.test('const consoleLabel = "n/a";')).toBe(false);
  });
});
