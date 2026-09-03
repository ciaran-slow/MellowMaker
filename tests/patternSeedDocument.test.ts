/** @jest-environment node */

import {
  parsePatternSeedDocument,
  PatternSeedError,
} from '@/data/seed/patternSeedDocument';

/**
 * Every case starts from a valid fixture built here rather than from the
 * committed content, applies one mutation, and asserts the exact issue paths, so
 * a rule cannot appear to hold because the shipped bytes happen to be fine.
 *
 * Boundary lengths are written as literals independent of the parser's limit
 * constants, so an off-by-one in a limit fails instead of moving with it.
 */
function patternFixture(index: number): Record<string, unknown> {
  return {
    slug: `fixture-pattern-${index}`,
    title: `Fixture pattern ${index}`,
    notes: `Hook 5.0 mm · Fixture yarn number ${index} · Finishes about 12 cm square`,
    steps: [
      `Chain 21 for fixture ${index} and keep every loop the same size.`,
      `Work one row across fixture ${index} and count the stitches.`,
      `Repeat the row for fixture ${index} until the piece is square.`,
      `Fasten off fixture ${index} and weave both ends in neatly.`,
    ],
  };
}

function documentFixture(
  patterns: readonly Record<string, unknown>[] = [
    patternFixture(0),
    patternFixture(1),
  ],
): Record<string, unknown> {
  return { seedVersion: 1, terminology: 'US', patterns: [...patterns] };
}

function withPattern(
  index: number,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const patterns = [patternFixture(0), patternFixture(1)];
  patterns[index] = { ...patterns[index], ...changes };

  return documentFixture(patterns);
}

function withoutPatternKey(key: string): Record<string, unknown> {
  const patterns = [patternFixture(0), patternFixture(1)];
  const target = { ...patterns[0] };
  delete target[key];
  patterns[0] = target;

  return documentFixture(patterns);
}

function generatedSteps(count: number): string[] {
  return Array.from(
    { length: count },
    (_unused, index) => `Work step number ${index} of this fixture pattern.`,
  );
}

function rejectionPaths(input: unknown): readonly string[] {
  const result = parsePatternSeedDocument(input);
  if (result.ok) {
    throw new Error(
      'Expected the document to be rejected, but it validated successfully.',
    );
  }

  return result.issues.map((issue) => issue.path);
}

describe('bundled pattern content format', () => {
  const rejections: readonly {
    readonly name: string;
    readonly input: unknown;
    readonly paths: readonly string[];
  }[] = [
    {
      name: 'an unknown root key',
      input: { ...documentFixture(), locale: 'en-GB' },
      paths: ['locale'],
    },
    {
      name: 'an unknown record key',
      input: withPattern(1, { difficulty: 'beginner' }),
      paths: ['patterns[1].difficulty'],
    },
    {
      name: 'a missing record key',
      input: withoutPatternKey('notes'),
      paths: ['patterns[0].notes'],
    },
    {
      name: 'a seed version below one',
      input: { ...documentFixture(), seedVersion: 0 },
      paths: ['seedVersion'],
    },
    {
      name: 'a non-integer seed version',
      input: { ...documentFixture(), seedVersion: 1.5 },
      paths: ['seedVersion'],
    },
    {
      name: 'UK terminology',
      input: { ...documentFixture(), terminology: 'UK' },
      paths: ['terminology'],
    },
    {
      name: 'a duplicate slug',
      input: withPattern(1, { slug: 'fixture-pattern-0' }),
      paths: ['patterns[1].slug'],
    },
    {
      name: 'a slug that is not kebab-case',
      input: withPattern(0, { slug: 'Fixture_Pattern' }),
      paths: ['patterns[0].slug'],
    },
    {
      name: 'two titles differing only in case',
      input: withPattern(1, { title: 'FIXTURE PATTERN 0' }),
      paths: ['patterns[1].title'],
    },
    {
      name: 'notes naming no hook size in millimetres',
      input: withPattern(0, {
        notes: 'Worsted cotton yarn and a comfortable hook of any size at all',
      }),
      paths: ['patterns[0].notes'],
    },
    {
      name: 'notes one character below the minimum',
      input: withPattern(0, { notes: 'Hook 5.0 mm · cott' }),
      paths: ['patterns[0].notes'],
    },
    {
      name: 'an untrimmed step',
      input: withPattern(0, {
        steps: [' Chain 21 and keep the loops even.', ...generatedSteps(3)],
      }),
      paths: ['patterns[0].steps[0]'],
    },
    {
      name: 'a step one character below the minimum',
      input: withPattern(0, { steps: ['Chain 21.', ...generatedSteps(3)] }),
      paths: ['patterns[0].steps[0]'],
    },
    {
      name: 'a step one character above the maximum',
      input: withPattern(0, {
        steps: [`Chain ${'a'.repeat(194)}.`, ...generatedSteps(3)],
      }),
      paths: ['patterns[0].steps[0]'],
    },
    {
      name: 'a step repeated inside one record',
      input: withPattern(0, {
        steps: [
          'Chain 21 and keep every loop the same size.',
          'Chain 21 and keep every loop the same size.',
          ...generatedSteps(2),
        ],
      }),
      paths: ['patterns[0].steps[1]'],
    },
    {
      name: 'a step that only restates the notes',
      input: withPattern(0, {
        steps: [
          'Hook 5.0 mm · Fixture yarn number 0 · Finishes about 12 cm square',
          ...generatedSteps(3),
        ],
      }),
      paths: ['patterns[0].steps[0]'],
    },
    {
      name: 'three steps',
      input: withPattern(0, { steps: generatedSteps(3) }),
      paths: ['patterns[0].steps'],
    },
    {
      name: 'thirteen steps',
      input: withPattern(0, { steps: generatedSteps(13) }),
      paths: ['patterns[0].steps'],
    },
    {
      name: 'two records sharing an identical step list',
      input: withPattern(1, { steps: patternFixture(0).steps }),
      paths: ['patterns[1].steps'],
    },
    {
      name: 'placeholder copy',
      input: withPattern(0, {
        steps: ['TODO: write the swatch steps here', ...generatedSteps(3)],
      }),
      paths: ['patterns[0].steps[0]'],
    },
    {
      name: 'an empty record list',
      input: documentFixture([]),
      paths: ['patterns'],
    },
    {
      name: 'thirteen records',
      input: documentFixture(
        Array.from({ length: 13 }, (_unused, index) => patternFixture(index)),
      ),
      paths: ['patterns'],
    },
  ];

  for (const rejection of rejections) {
    it(`rejects ${rejection.name}`, () => {
      expect(rejectionPaths(rejection.input)).toStrictEqual(rejection.paths);
    });
  }

  it('reports every fault in one pass rather than stopping at the first', () => {
    const patterns = [patternFixture(0), patternFixture(1)];
    patterns[0] = {
      ...patterns[0],
      slug: 'Not Kebab',
      notes: 'No hook size is named anywhere in these particular notes',
    };
    patterns[1] = { ...patterns[1], steps: generatedSteps(2) };

    expect(
      rejectionPaths({
        seedVersion: 0,
        terminology: 'UK',
        patterns,
        extra: true,
      }),
    ).toStrictEqual([
      'extra',
      'seedVersion',
      'terminology',
      'patterns[0].slug',
      'patterns[0].notes',
      'patterns[1].steps',
    ]);
  });

  it('accepts a valid document and keeps the records in input order', () => {
    const result = parsePatternSeedDocument(documentFixture());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.document.patterns.map((pattern) => pattern.slug)).toStrictEqual(
      ['fixture-pattern-0', 'fixture-pattern-1'],
    );
    expect(result.document.seedVersion).toBe(1);
    expect(result.document.terminology).toBe('US');
  });

  it('accepts the inclusive edge of every length limit', () => {
    const result = parsePatternSeedDocument(
      withPattern(0, {
        title: 'Ab',
        notes: `Hook 5.0 mm · ${'y'.repeat(6)}`,
        steps: [
          'Chain 21!',
          ...generatedSteps(2),
          `Chain ${'a'.repeat(193)}.`,
        ],
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    // Only the deliberately short step is at fault: 'Chain 21!' is 9 characters,
    // one below the minimum, while 2-character title, 20-character notes, and
    // 200-character step all sit exactly on their inclusive edges.
    expect(result.issues.map((issue) => issue.path)).toStrictEqual([
      'patterns[0].steps[0]',
    ]);

    const onEdge = parsePatternSeedDocument(
      withPattern(0, {
        title: 'Ab',
        notes: `Hook 5.0 mm · ${'y'.repeat(6)}`,
        steps: [
          'Chain 21.!',
          ...generatedSteps(2),
          `Chain ${'a'.repeat(193)}.`,
        ],
      }),
    );

    expect(onEdge.ok).toBe(true);
  });

  it('leaves the input document untouched', () => {
    const input = documentFixture();
    const snapshot = JSON.stringify(input);

    parsePatternSeedDocument(input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('names issue paths only, never step prose, in its error message', () => {
    const result = parsePatternSeedDocument(
      withPattern(0, {
        steps: [
          'TODO: describe the secret unfinished swatch technique',
          ...generatedSteps(3),
        ],
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    const error = new PatternSeedError(result.issues);

    expect(error).toBeInstanceOf(PatternSeedError);
    expect(error.message).toBe(
      'Bundled pattern content is invalid at: patterns[0].steps[0]',
    );
    expect(error.message).not.toContain('secret unfinished swatch');
  });

  it('names the document itself when the root is the wrong shape', () => {
    expect(rejectionPaths([documentFixture()])).toStrictEqual(['']);
    expect(rejectionPaths('a string of content')).toStrictEqual(['']);
    expect(new PatternSeedError([{ path: '', message: 'x' }]).message).toBe(
      'Bundled pattern content is invalid at: <document>',
    );
  });

  it('names the record when a pattern entry is not an object', () => {
    expect(rejectionPaths(documentFixture(['Practice Swatch' as never]))).toStrictEqual(
      ['patterns[0]'],
    );
  });
});
