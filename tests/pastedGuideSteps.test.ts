import { parsePastedGuideSteps } from '@/domain/guides/pastedGuideSteps';

/**
 * Issue #50: the pure classifier that turns maker-pasted YouTube text into an
 * ordered step draft.
 *
 * Every number below — offsets, step counts, the character cap, the merge window
 * boundary — is written **literally** here and never imported from the module
 * under test. The module's four bounds are deliberately module-private precisely
 * so a fixture physically cannot derive its expectation from the constant it is
 * meant to pin.
 */

const CHAPTERS_INLINE =
  '0:00 Materials\n1:12 Magic ring\n2:40 Round 1\n5:03 Fasten off';
const CHAPTERS_OWN_LINE =
  '0:00\nMaterials\n1:12\nMagic ring\n2:40\nRound 1\n5:03\nFasten off';

function stepsOf(raw: string) {
  const result = parsePastedGuideSteps(raw);
  if (!result.ok) {
    throw new Error(`Expected a parse, got rejection: ${result.reason}`);
  }

  return result;
}

/** `count` cues at exactly `spacingMs` apart, each with distinct text. */
function cueBlock(count: number, spacingMs: number): string {
  return Array.from({ length: count }, (_, index) => {
    const totalSeconds = (index * spacingMs) / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')} cue${index}`;
  }).join('\n');
}

/** `count` labelled chapter entries one minute apart. */
function chapterBlock(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `${index}:00 Round ${index + 1}`,
  ).join('\n');
}

describe('parsePastedGuideSteps — chapters (the primary source)', () => {
  it('turns a four-line description block into four labelled steps', () => {
    const result = stepsOf(CHAPTERS_INLINE);

    expect(result.source).toBe('chapters');
    expect(result.steps).toHaveLength(4);
    expect(result.steps.map((step) => step.instruction)).toStrictEqual([
      'Materials',
      'Magic ring',
      'Round 1',
      'Fasten off',
    ]);
    // 0:00 → 0, 1:12 → 72000, 2:40 → 160000, 5:03 → 303000 ms.
    expect(result.steps.map((step) => step.videoOffsetMs)).toStrictEqual([
      0, 72000, 160000, 303000,
    ]);
    // A creator's chapter label is an instruction, never a transcript excerpt.
    expect(
      result.steps.map((step) => step.transcriptExcerpt),
    ).toStrictEqual([undefined, undefined, undefined, undefined]);
  });

  it('produces identical output for both clipboard shapes', () => {
    // Timestamp-inline and timestamp-on-its-own-line carry the same content, so
    // an implementation handling only one shape fails here.
    expect(parsePastedGuideSteps(CHAPTERS_OWN_LINE)).toStrictEqual(
      parsePastedGuideSteps(CHAPTERS_INLINE),
    );
  });

  it('strips bracket wrappers and separators without eating the label', () => {
    const result = stepsOf('[0:00] - Materials\n(1:12) — Magic ring\n2:40 | Round 1');

    expect(result.source).toBe('chapters');
    expect(result.steps.map((step) => step.instruction)).toStrictEqual([
      'Materials',
      'Magic ring',
      'Round 1',
    ]);
  });

  it('drops a header sitting above the first timestamp', () => {
    const result = stepsOf(`Chapters:\n${CHAPTERS_INLINE}`);

    expect(result.steps.map((step) => step.instruction)).toStrictEqual([
      'Materials',
      'Magic ring',
      'Round 1',
      'Fasten off',
    ]);
    expect(
      result.steps.some((step) => step.instruction.includes('Chapters')),
    ).toBe(false);
  });

  it('drops prose that a blank line cut off from the entry above it', () => {
    // A blank line CLOSES the open entry, so a sponsor blurb sitting between
    // two chapter lines belongs to neither of them. Without that rule the
    // blurb is appended to the entry above and ships inside a maker's step.
    const result = stepsOf(
      '0:00 Materials\n\nSponsored by Yarn Co\n1:12 Magic ring',
    );

    expect(result.source).toBe('chapters');
    expect(result.steps.map((step) => step.instruction)).toStrictEqual([
      'Materials',
      'Magic ring',
    ]);
    expect(
      result.steps.some((step) => step.instruction.includes('Sponsored')),
    ).toBe(false);
  });
});

describe('parsePastedGuideSteps — transcript cues (the fallback)', () => {
  it('merges forty three-second cues into four thirty-second blocks', () => {
    const result = stepsOf(cueBlock(40, 3000));

    expect(result.source).toBe('cues');
    // One step per cue would be 40; the merge window fixes it at 4.
    expect(result.steps).toHaveLength(4);
    // The FIRST cue's offset, not the last (which would be
    // [27000, 57000, 87000, 117000]) and not a `<=` window boundary (which
    // would be [0, 33000, …]).
    expect(result.steps.map((step) => step.videoOffsetMs)).toStrictEqual([
      0, 30000, 60000, 90000,
    ]);
    expect(result.steps[0]?.instruction).toBe(
      'cue0 cue1 cue2 cue3 cue4 cue5 cue6 cue7 cue8 cue9',
    );
    expect(result.steps[3]?.instruction).toBe(
      'cue30 cue31 cue32 cue33 cue34 cue35 cue36 cue37 cue38 cue39',
    );
    // On the cue path the joined text seeds both fields, so a maker can rewrite
    // the instruction without losing the words they pasted.
    for (const step of result.steps) {
      expect(step.transcriptExcerpt).toBe(step.instruction);
    }
  });

  it('breaks a cue run at a blank line rather than swallowing it', () => {
    const result = stepsOf(
      '0:00 one\n0:03 two\n0:06 three\n\n0:09 four\n0:12 five\n0:15 six',
    );

    // Without the break the thirty-second window would merge all six into one.
    expect(result.steps).toHaveLength(2);
    expect(result.steps.map((step) => step.videoOffsetMs)).toStrictEqual([
      0, 9000,
    ]);
    expect(result.steps.map((step) => step.instruction)).toStrictEqual([
      'one two three',
      'four five six',
    ]);
  });

  it('never repairs the pasted order', () => {
    const result = stepsOf('5:00 Third\n4:00 Second\n3:00 First');

    expect(result.steps.map((step) => step.instruction)).toStrictEqual([
      'Third',
      'Second',
      'First',
    ]);
    // A sort would give [180000, 240000, 300000]; a merge that swallowed the
    // descending run would give one step.
    expect(result.steps.map((step) => step.videoOffsetMs)).toStrictEqual([
      300000, 240000, 180000,
    ]);
  });

  it('breaks a cue run when two consecutive cues share an offset', () => {
    // The run-break rule is `offset <= lastOffset`, not `<`: a repeated offset
    // has stopped ascending just as a descending one has. Under `<` all four
    // cues fall inside the window and merge into a single block.
    const result = stepsOf('0:00 a\n0:03 b\n0:03 c\n0:06 d');

    expect(result.source).toBe('cues');
    expect(result.steps).toHaveLength(2);
    expect(
      result.steps.map((step) => [step.videoOffsetMs, step.instruction]),
    ).toStrictEqual([
      [0, 'a b'],
      [3000, 'c d'],
    ]);
  });
});

describe('parsePastedGuideSteps — classifier discrimination', () => {
  it('classifies a chapter list that does not start at 0:00 as chapters', () => {
    const result = stepsOf('1:12 Magic ring\n2:40 Round 1\n5:03 Fasten off');

    // YouTube's "first timestamp must be 00:00" rule governs whether YouTube
    // renders chapters, not what a maker may select; a partial selection is the
    // realistic phone gesture.
    expect(result.source).toBe('chapters');
    expect(result.steps.map((step) => step.videoOffsetMs)).toStrictEqual([
      72000, 160000, 303000,
    ]);
    expect(result.steps.every((step) => step.transcriptExcerpt === undefined)).toBe(
      true,
    );
  });

  it('classifies two labelled entries as chapters', () => {
    const result = stepsOf('0:00 Materials\n1:12 Magic ring');

    // Falsifies a classifier that insists on YouTube's three-timestamp minimum.
    expect(result.source).toBe('chapters');
    expect(result.steps.map((step) => step.videoOffsetMs)).toStrictEqual([
      0, 72000,
    ]);
    expect(result.steps.every((step) => step.transcriptExcerpt === undefined)).toBe(
      true,
    );
  });

  it('falls back to cues when any gap is under ten seconds', () => {
    const result = stepsOf('0:00 Intro\n0:06 Materials\n2:40 Round 1');

    // A classifier ignoring the ten-second rule would emit three chapter steps.
    expect(result.source).toBe('cues');
    expect(result.steps).toHaveLength(2);
    expect(
      result.steps.map((step) => [step.videoOffsetMs, step.instruction]),
    ).toStrictEqual([
      [0, 'Intro Materials'],
      [160000, 'Round 1'],
    ]);
    expect(result.steps.every((step) => step.transcriptExcerpt !== undefined)).toBe(
      true,
    );
  });

  it('falls back to cues when any entry carries no label', () => {
    // Load-bearing, not cosmetic. `guide_step.instruction` is NOT NULL but has
    // no non-empty CHECK (`migrations.ts`), so without this condition the
    // wordless 1:12 entry classifies as a chapter and a step with
    // `instruction: ''` is drafted, confirmed, and persisted — the editor then
    // renders a row named "Step 2 of 3 at 1:12: ". On the cue path the
    // wordless block emits no step at all.
    const result = stepsOf('0:00 Materials\n1:12\n2:40 Round 1');

    expect(result.source).toBe('cues');
    expect(result.steps).toHaveLength(2);
    expect(
      result.steps.map((step) => [step.videoOffsetMs, step.instruction]),
    ).toStrictEqual([
      [0, 'Materials'],
      [160000, 'Round 1'],
    ]);
  });
});

describe('parsePastedGuideSteps — negative branches', () => {
  it('rejects nothing pasted', () => {
    expect(parsePastedGuideSteps('')).toStrictEqual({
      ok: false,
      reason: 'empty',
    });
    expect(parsePastedGuideSteps('   \n \n')).toStrictEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('accepts input exactly at the character cap and rejects it for its content', () => {
    const atCap = 'x'.repeat(100000);

    expect(atCap).toHaveLength(100000);
    // Rejected for having no time code, NOT for length: the cap is not what
    // stopped it.
    expect(parsePastedGuideSteps(atCap)).toStrictEqual({
      ok: false,
      reason: 'no-timestamps',
    });
  });

  it('refuses a paste one character over the cap before parsing it', () => {
    const padding = 'x'.repeat(100001 - CHAPTERS_INLINE.length - 1);
    const overCap = `${padding}\n${CHAPTERS_INLINE}`;

    expect(overCap).toHaveLength(100001);
    // The same content parses fine when short enough, so only the cap can be
    // rejecting it — and it is checked before any scanning.
    expect(parsePastedGuideSteps(CHAPTERS_INLINE).ok).toBe(true);
    expect(parsePastedGuideSteps(overCap)).toStrictEqual({
      ok: false,
      reason: 'too-long',
    });
  });

  it('does not read a leading stitch count as a bare-seconds timestamp', () => {
    // The recognizer is line-LEADING, so these lines are the ones that reach the
    // colon-only rule at all: a bare-seconds recognizer would turn them into
    // steps at 0:06 and 0:12, fabricating steps out of stitch counts.
    expect(
      parsePastedGuideSteps('6 double crochets\n12 single crochets'),
    ).toStrictEqual({ ok: false, reason: 'no-timestamps' });
    // …and prose whose number sits mid-line never leads at all.
    expect(parsePastedGuideSteps('Chain 6 stitches\nThen turn')).toStrictEqual({
      ok: false,
      reason: 'no-timestamps',
    });
  });

  it('rejects time codes with no step text', () => {
    expect(parsePastedGuideSteps('0:00\n0:05\n0:10')).toStrictEqual({
      ok: false,
      reason: 'no-step-text',
    });
  });

  it('accepts exactly two hundred steps and refuses two hundred and one', () => {
    const atCap = stepsOf(chapterBlock(200));
    expect(atCap.steps).toHaveLength(200);

    const overCap = parsePastedGuideSteps(chapterBlock(201));
    // Refused, never truncated — and the result carries no `steps`, so nothing
    // can be half-applied.
    expect(overCap).toStrictEqual({ ok: false, reason: 'too-many-steps' });
    expect('steps' in overCap).toBe(false);
  });

  it('skips a malformed timestamp line without leaking its text or aborting', () => {
    const result = stepsOf('0:00 Materials\n99:99 Broken line\n2:40 Round 1');

    expect(result.steps).toHaveLength(2);
    expect(result.steps.map((step) => step.instruction)).toStrictEqual([
      'Materials',
      'Round 1',
    ]);
    expect(result.steps.map((step) => step.videoOffsetMs)).toStrictEqual([
      0, 160000,
    ]);
    // The skipped line's text is not attributed to a neighbouring step.
    expect(
      result.steps.some((step) => step.instruction.includes('Broken')),
    ).toBe(false);
  });

  it('does not turn an all-malformed paste into a silent success', () => {
    expect(
      parsePastedGuideSteps('99:99 Broken\n88:88 Also broken'),
    ).toStrictEqual({ ok: false, reason: 'no-timestamps' });
  });
});
