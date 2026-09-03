type Block = { source: string; fields: Record<string, string> };

// The checker is a CommonJS repo script (it shells out to `gh`), not app source.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseBlocks, evaluate } = require('../scripts/check-stage-provenance.js') as {
  parseBlocks: (body: string, source: string) => Block[];
  evaluate: (blocks: Block[]) => { problems: string[]; warnings: string[] };
};

/**
 * Issue #14 retro: plan, build, verify and the blocker fix all ran in one
 * conversation, and the PR body named a builder model that had been switched
 * out immediately before the build. `scripts/check-stage-provenance.js` turns
 * that claim into a checkable record; these cases pin the two things that would
 * otherwise rot silently — the block parser and the rules that decide a run is
 * not independent. A guard that mis-parses is worse than no guard, because it
 * reports "independent" for artifacts it never read.
 */

const block = (fields: Record<string, string>) =>
  ['Stage-Provenance:', ...Object.entries(fields).map(([k, v]) => `  ${k}: ${v}`)].join('\n');

const fresh = (stage: string, model: string) =>
  block({
    stage,
    context: 'fresh',
    'prior-stages-in-this-context': 'none',
    model,
    'model-switched-mid-session': 'no',
  });

const problemsFor = (bodies: string[]) =>
  evaluate(bodies.flatMap((body, i) => parseBlocks(body, `source ${i}`))).problems;

describe('stage-provenance parsing', () => {
  it('reads the fields out of a block surrounded by prose and a fence', () => {
    const body = ['## Builder', '', '```', fresh('build', 'claude-opus-5'), '```', '', 'Trailing prose.'].join(
      '\n',
    );

    expect(parseBlocks(body, 'PR body')).toStrictEqual([
      {
        source: 'PR body',
        fields: {
          stage: 'build',
          context: 'fresh',
          'prior-stages-in-this-context': 'none',
          model: 'claude-opus-5',
          'model-switched-mid-session': 'no',
        },
      },
    ]);
  });

  it('reads a block written as a markdown list with backticked values', () => {
    const body = [
      'Stage-Provenance:',
      '- stage: `verify`',
      '- context: `fresh`',
      '- prior-stages-in-this-context: `none`',
      '- model: `claude-fable-5-1`',
      '- model-switched-mid-session: `no`',
    ].join('\n');

    expect(parseBlocks(body, 'review')[0]?.fields).toStrictEqual({
      stage: 'verify',
      context: 'fresh',
      'prior-stages-in-this-context': 'none',
      model: 'claude-fable-5-1',
      'model-switched-mid-session': 'no',
    });
  });

  it('finds no block in a body that merely mentions the workflow', () => {
    expect(parseBlocks('Plan, build and verify all ran here. model: opus', 'x')).toStrictEqual([]);
  });
});

describe('stage-independence rules', () => {
  it('accepts three fresh stages with distinct models', () => {
    const result = evaluate(
      [fresh('plan', 'model-a'), fresh('build', 'model-b'), fresh('verify', 'model-c')].flatMap(
        (body, i) => parseBlocks(body, `source ${i}`),
      ),
    );

    expect(result.problems).toStrictEqual([]);
    expect(result.warnings).toStrictEqual([]);
  });

  it('flags a missing stage rather than passing on the stages present', () => {
    expect(problemsFor([fresh('plan', 'model-a'), fresh('build', 'model-b')])).toStrictEqual([
      'verify: no Stage-Provenance block found in any posted artifact',
    ]);
  });

  it('fails the #14 shape: every stage in one shared context', () => {
    const shared = (stage: string) =>
      block({
        stage,
        context: 'shared',
        'prior-stages-in-this-context': 'plan, build',
        model: 'unverifiable',
        'model-switched-mid-session': 'yes',
      });

    const problems = problemsFor([shared('plan'), shared('build'), shared('verify')]);

    expect(problems).toHaveLength(3);
    expect(problems.every((p) => p.includes('SHARED context'))).toBe(true);
  });

  it('fails a model id claimed alongside a mid-session switch', () => {
    const claimed = block({
      stage: 'build',
      context: 'fresh',
      'prior-stages-in-this-context': 'none',
      model: 'claude-opus-5',
      'model-switched-mid-session': 'yes',
    });

    expect(
      problemsFor([fresh('plan', 'model-a'), claimed, fresh('verify', 'model-c')]),
    ).toStrictEqual([
      'build: claims model "claude-opus-5" while `model-switched-mid-session` is "yes" — a switched or unstated session must record `model: unverifiable`',
    ]);
  });

  it('warns, without failing, when build and verify share a model', () => {
    const result = evaluate(
      [fresh('plan', 'model-a'), fresh('build', 'model-b'), fresh('verify', 'model-b')].flatMap(
        (body, i) => parseBlocks(body, `source ${i}`),
      ),
    );

    expect(result.problems).toStrictEqual([]);
    expect(result.warnings).toStrictEqual([
      'build and verify both ran on "model-b" — allowed, but a different model for verify is preferred',
    ]);
  });
});
