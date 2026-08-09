/** @jest-environment node */

import {
  parseStitchSeedDocument,
  StitchSeedError,
} from '@/data/seed/stitchSeedDocument';

/**
 * Every case starts from a valid fixture built here rather than from the
 * committed content, applies one mutation, and asserts the exact issue paths, so
 * a rule cannot appear to hold because the shipped bytes happen to be fine.
 *
 * Boundary lengths are written as literals independent of the parser's limit
 * constants, so an off-by-one in a limit fails instead of moving with it.
 */
function stitchFixture(index: number): Record<string, unknown> {
  return {
    slug: `fixture-stitch-${index}`,
    name: `Fixture stitch ${index}`,
    abbreviation: `fx${index}`,
    difficulty: 'beginner',
    summary: `A fixture stitch number ${index} used only by these validator tests`,
    instructions: [
      { instruction: `Wrap the yarn over the hook, fixture ${index}` },
      { instruction: `Draw it through the loop on the hook, fixture ${index}` },
      { instruction: `Keep every loop the same size, fixture ${index}` },
    ],
  };
}

function documentFixture(
  stitches: readonly Record<string, unknown>[] = [
    stitchFixture(0),
    stitchFixture(1),
  ],
): Record<string, unknown> {
  return { seedVersion: 1, terminology: 'US', stitches: [...stitches] };
}

function withStitch(
  index: number,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const stitches = [stitchFixture(0), stitchFixture(1)];
  stitches[index] = { ...stitches[index], ...changes };

  return documentFixture(stitches);
}

function withoutStitchKey(key: string): Record<string, unknown> {
  const stitches = [stitchFixture(0), stitchFixture(1)];
  const target = { ...stitches[0] };
  delete target[key];
  stitches[0] = target;

  return documentFixture(stitches);
}

function generatedSteps(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_unused, index) => ({
    instruction: `Work step number ${index} of this fixture stitch`,
  }));
}

function rejectionPaths(input: unknown): readonly string[] {
  const result = parseStitchSeedDocument(input);
  if (result.ok) {
    throw new Error(
      'Expected the document to be rejected, but it validated successfully.',
    );
  }

  return result.issues.map((issue) => issue.path);
}

describe('bundled stitch content format', () => {
  const rejections: readonly {
    readonly name: string;
    readonly input: unknown;
    readonly paths: readonly string[];
  }[] = [
    { name: 'an array root', input: [], paths: [''] },
    { name: 'a null root', input: null, paths: [''] },
    { name: 'a string root', input: 'stitches', paths: [''] },
    {
      name: 'a misspelled root key',
      input: { ...documentFixture(), stiches: [] },
      paths: ['stiches'],
    },
    {
      name: 'a zero seed version',
      input: { ...documentFixture(), seedVersion: 0 },
      paths: ['seedVersion'],
    },
    {
      name: 'a negative seed version',
      input: { ...documentFixture(), seedVersion: -1 },
      paths: ['seedVersion'],
    },
    {
      name: 'a fractional seed version',
      input: { ...documentFixture(), seedVersion: 1.5 },
      paths: ['seedVersion'],
    },
    {
      name: 'a string seed version',
      input: { ...documentFixture(), seedVersion: '1' },
      paths: ['seedVersion'],
    },
    {
      name: 'UK terminology',
      input: { ...documentFixture(), terminology: 'UK' },
      paths: ['terminology'],
    },
    {
      name: 'absent terminology',
      input: { seedVersion: 1, stitches: [stitchFixture(0)] },
      paths: ['terminology'],
    },
    {
      name: 'an empty stitch list',
      input: documentFixture([]),
      paths: ['stitches'],
    },
    {
      name: 'a stitch list that is not an array',
      input: { seedVersion: 1, terminology: 'US', stitches: {} },
      paths: ['stitches'],
    },
    {
      name: 'an unknown record key',
      input: withStitch(0, { image: 'chain.png' }),
      paths: ['stitches[0].image'],
    },
    {
      name: 'an absent summary',
      input: withoutStitchKey('summary'),
      paths: ['stitches[0].summary'],
    },
    {
      name: 'a title-cased slug',
      input: withStitch(0, { slug: 'Single Crochet' }),
      paths: ['stitches[0].slug'],
    },
    {
      name: 'a doubled slug separator',
      input: withStitch(0, { slug: 'single--crochet' }),
      paths: ['stitches[0].slug'],
    },
    {
      name: 'a leading slug separator',
      input: withStitch(0, { slug: '-sc' }),
      paths: ['stitches[0].slug'],
    },
    {
      name: 'an empty slug',
      input: withStitch(0, { slug: '' }),
      paths: ['stitches[0].slug'],
    },
    {
      name: 'a duplicated slug',
      input: withStitch(1, { slug: 'fixture-stitch-0' }),
      paths: ['stitches[1].slug'],
    },
    {
      name: 'an empty abbreviation',
      input: withStitch(0, { abbreviation: '' }),
      paths: ['stitches[0].abbreviation'],
    },
    {
      name: 'a leading-space abbreviation',
      input: withStitch(0, { abbreviation: ' sc' }),
      paths: ['stitches[0].abbreviation'],
    },
    {
      name: 'a double-spaced abbreviation',
      input: withStitch(0, { abbreviation: 'sc  st' }),
      paths: ['stitches[0].abbreviation'],
    },
    {
      name: 'a nine-character abbreviation',
      input: withStitch(0, { abbreviation: 'x'.repeat(9) }),
      paths: ['stitches[0].abbreviation'],
    },
    {
      name: 'an abbreviation differing only in case',
      input: withStitch(1, { abbreviation: 'FX0' }),
      paths: ['stitches[1].abbreviation'],
    },
    {
      name: 'a difficulty outside the schema set',
      input: withStitch(0, { difficulty: 'easy' }),
      paths: ['stitches[0].difficulty'],
    },
    {
      name: 'a nineteen-character summary',
      input: withStitch(0, { summary: 'x'.repeat(19) }),
      paths: ['stitches[0].summary'],
    },
    {
      name: 'a hundred-and-forty-one-character summary',
      input: withStitch(0, { summary: 'x'.repeat(141) }),
      paths: ['stitches[0].summary'],
    },
    {
      name: 'an untrimmed summary',
      input: withStitch(0, {
        summary: ' A summary that carries a leading space ',
      }),
      paths: ['stitches[0].summary'],
    },
    {
      name: 'no instructions at all',
      input: withStitch(0, { instructions: [] }),
      paths: ['stitches[0].instructions'],
    },
    {
      name: 'two instructions',
      input: withStitch(0, { instructions: generatedSteps(2) }),
      paths: ['stitches[0].instructions'],
    },
    {
      name: 'eight instructions',
      input: withStitch(0, { instructions: generatedSteps(8) }),
      paths: ['stitches[0].instructions'],
    },
    {
      name: 'instructions that are not an array',
      input: withStitch(0, { instructions: 'Chain one and turn' }),
      paths: ['stitches[0].instructions'],
    },
    {
      name: 'a fourteen-character instruction',
      input: withStitch(0, {
        instructions: [
          ...generatedSteps(1),
          { instruction: 'x'.repeat(14) },
          ...generatedSteps(3).slice(2),
        ],
      }),
      paths: ['stitches[0].instructions[1].instruction'],
    },
    {
      name: 'a two-hundred-and-one-character instruction',
      input: withStitch(0, {
        instructions: [
          ...generatedSteps(1),
          { instruction: 'x'.repeat(201) },
          ...generatedSteps(3).slice(2),
        ],
      }),
      paths: ['stitches[0].instructions[1].instruction'],
    },
    {
      name: 'an untrimmed instruction',
      input: withStitch(0, {
        instructions: [
          ...generatedSteps(1),
          { instruction: 'Yarn over and pull up a loop ' },
          ...generatedSteps(3).slice(2),
        ],
      }),
      paths: ['stitches[0].instructions[1].instruction'],
    },
    {
      name: 'an instruction that is not a string',
      input: withStitch(0, {
        instructions: [
          ...generatedSteps(1),
          { instruction: 42 },
          ...generatedSteps(3).slice(2),
        ],
      }),
      paths: ['stitches[0].instructions[1].instruction'],
    },
    {
      name: 'an instruction that is not an object',
      input: withStitch(0, {
        instructions: [
          ...generatedSteps(1),
          'Yarn over and pull up a loop',
          ...generatedSteps(3).slice(2),
        ],
      }),
      paths: ['stitches[0].instructions[1]'],
    },
    {
      name: 'an unknown instruction key',
      input: withStitch(0, {
        instructions: [
          { ...generatedSteps(1)[0], image: 'chain.png' },
          ...generatedSteps(3).slice(1),
        ],
      }),
      paths: ['stitches[0].instructions[0].image'],
    },
    {
      name: 'a repeated instruction within one record',
      input: withStitch(0, {
        instructions: [
          ...generatedSteps(3),
          { instruction: 'Work step number 0 of this fixture stitch' },
        ],
      }),
      paths: ['stitches[0].instructions[3].instruction'],
    },
    {
      name: 'an instruction restating the summary',
      input: withStitch(0, {
        summary: 'Wrap the yarn over the hook and pull up a loop',
        instructions: [
          { instruction: 'Wrap the yarn over the hook and pull up a loop' },
          ...generatedSteps(3).slice(1),
        ],
      }),
      paths: ['stitches[0].instructions[0].instruction'],
    },
    {
      name: 'a to-do instruction',
      input: withStitch(0, {
        instructions: [
          { instruction: 'TODO: write this step properly' },
          ...generatedSteps(3).slice(1),
        ],
      }),
      paths: ['stitches[0].instructions[0].instruction'],
    },
    {
      name: 'a placeholder instruction',
      input: withStitch(0, {
        instructions: [
          { instruction: 'Placeholder text for the step' },
          ...generatedSteps(3).slice(1),
        ],
      }),
      paths: ['stitches[0].instructions[0].instruction'],
    },
    {
      name: 'a placeholder summary',
      input: withStitch(0, { summary: 'Coming soon: how this stitch works' }),
      paths: ['stitches[0].summary'],
    },
    {
      name: 'an empty image asset key',
      input: withStitch(0, {
        instructions: [
          { ...generatedSteps(1)[0], imageAssetKey: '' },
          ...generatedSteps(3).slice(1),
        ],
      }),
      paths: ['stitches[0].instructions[0].imageAssetKey'],
    },
    {
      name: 'a file-named image asset key',
      input: withStitch(0, {
        instructions: [
          { ...generatedSteps(1)[0], imageAssetKey: 'Chain_01.png' },
          ...generatedSteps(3).slice(1),
        ],
      }),
      paths: ['stitches[0].instructions[0].imageAssetKey'],
    },
    {
      name: 'two records sharing one instruction list',
      input: withStitch(1, { instructions: stitchFixture(0).instructions }),
      paths: ['stitches[1].instructions'],
    },
  ];

  it.each(rejections)('rejects $name', ({ input, paths }) => {
    expect(rejectionPaths(input)).toStrictEqual(paths);
  });

  it('reports every fault in one pass rather than stopping at the first', () => {
    const input = withStitch(0, {
      difficulty: 'easy',
      instructions: [
        { instruction: 'TODO: write this step properly' },
        ...generatedSteps(3).slice(1),
      ],
    });

    expect(rejectionPaths({ ...input, seedVersion: 0 })).toStrictEqual([
      'seedVersion',
      'stitches[0].difficulty',
      'stitches[0].instructions[0].instruction',
    ]);
  });

  it('accepts a valid document and keeps the records in input order', () => {
    const result = parseStitchSeedDocument(documentFixture());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.document.seedVersion).toBe(1);
    expect(result.document.terminology).toBe('US');
    expect(result.document.stitches.map((stitch) => stitch.slug)).toStrictEqual([
      'fixture-stitch-0',
      'fixture-stitch-1',
    ]);
  });

  it('accepts the inclusive edge of every length limit', () => {
    const result = parseStitchSeedDocument(
      withStitch(0, {
        name: 'xx',
        abbreviation: 'x'.repeat(8),
        summary: 'x'.repeat(20),
        instructions: [
          { instruction: 'x'.repeat(15) },
          { instruction: 'y'.repeat(200) },
          { instruction: 'z'.repeat(140) },
          { instruction: 'a'.repeat(16) },
          { instruction: 'b'.repeat(17) },
          { instruction: 'c'.repeat(18) },
          { instruction: 'd'.repeat(19) },
        ],
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('accepts a valid image asset key and omits the property when absent', () => {
    const result = parseStitchSeedDocument(
      withStitch(0, {
        instructions: [
          { ...generatedSteps(1)[0], imageAssetKey: 'chain-step-1' },
          ...generatedSteps(3).slice(1),
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const [withKey, withoutKey] =
      result.document.stitches[0]?.instructions ?? [];

    expect(withKey?.imageAssetKey).toBe('chain-step-1');
    // `exactOptionalPropertyTypes` means the repository must receive an absent
    // key, not an explicit `undefined` it would write as a value.
    expect(withoutKey === undefined || 'imageAssetKey' in withoutKey).toBe(
      false,
    );
  });

  it('leaves the input document untouched', () => {
    const input = documentFixture();
    const before = JSON.stringify(input);

    parseStitchSeedDocument(input);

    expect(JSON.stringify(input)).toBe(before);
  });

  it('names issue paths only, never instruction prose, in its error message', () => {
    const result = parseStitchSeedDocument(
      withStitch(0, {
        instructions: [
          { instruction: 'TODO: write this step properly' },
          ...generatedSteps(3).slice(1),
        ],
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    const error = new StitchSeedError(result.issues);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('StitchSeedError');
    expect(error.issues).toStrictEqual(result.issues);
    expect(error.message).toContain('stitches[0].instructions[0].instruction');
    expect(error.message).not.toContain('write this step properly');
  });

  it('names the document itself when the root is the wrong shape', () => {
    const result = parseStitchSeedDocument('not a document');

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(new StitchSeedError(result.issues).message).toContain('<document>');
  });
});
