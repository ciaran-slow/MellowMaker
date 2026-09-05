import path from 'node:path';

import eslintConfigRaw from '../eslint.config';
import jestConfig from '../jest.config';

const eslintConfig = eslintConfigRaw as readonly {
  readonly ignores?: readonly string[];
}[];

/**
 * Issue #46 retro. Every workflow stage runs in a git worktree under
 * `.claude/worktrees/<agent>/`. That directory is gitignored, which hides it
 * from git and from nothing else: Jest walks `rootDir` and ESLint's flat config
 * does not skip dot-directories, so a worktree left on disk after a stage ends
 * puts a **second complete copy of this repository** — on another branch,
 * possibly mid-edit — inside the primary checkout's `npm test` and `npm run
 * lint`. The failure mode is a gate that reports someone else's branch.
 *
 * Verified empirically before this test was written: a probe file at
 * `.claude/probetree/tests/probeSweep.test.ts` was listed by `jest --listTests`
 * and linted by `eslint .` on the pre-fix config, and is excluded by both after
 * it. `tsc` is unaffected — TypeScript's wildcard `include` skips directories
 * beginning with a dot — which is why only these two configs carry the rule.
 */
describe('repository gate configuration', () => {
  const ignorePatterns = jestConfig.testPathIgnorePatterns ?? [];
  const repoRoot = path.resolve(__dirname, '..');

  /** Jest matches each pattern, with `<rootDir>` expanded, against the file's
   *  absolute path — so this is the check the runner itself performs. */
  const matches = (absolutePath: string) =>
    ignorePatterns.some((pattern) =>
      new RegExp(pattern.replace('<rootDir>', repoRoot)).test(absolutePath),
    );

  it('keeps agent worktrees out of the Jest run, anchored to rootDir', () => {
    // Anchored, not bare: this very suite usually runs from a checkout that is
    // *itself* inside a `.claude/worktrees/` path, and a bare `/.claude/` would
    // ignore all 60 suites and exit green.
    expect(ignorePatterns).toContain('<rootDir>/.claude/');
    expect(ignorePatterns).not.toContain('/.claude/');
  });

  it('ignores a worktree test path while keeping this suite collectable', () => {
    expect(
      matches(
        path.join(repoRoot, '.claude/worktrees/agent-1/tests/patternDraft.test.ts'),
      ),
    ).toBe(true);
    expect(matches(path.join(repoRoot, 'tests/patternDraft.test.ts'))).toBe(false);
    expect(matches(__filename)).toBe(false);
    // The pre-existing patterns still do their own jobs.
    expect(matches(path.join(repoRoot, 'node_modules/pkg/x.test.js'))).toBe(true);
    expect(matches(path.join(repoRoot, '.expo/types/x.test.ts'))).toBe(true);
  });

  it('keeps agent worktrees out of the ESLint run', () => {
    const ignores = eslintConfig.flatMap((entry) => entry.ignores ?? []);

    expect(ignores).toContain('.claude/**');
    // Non-tautology: the block this asserts on is the real ignore list.
    expect(ignores).toContain('.expo/**');
  });
});
