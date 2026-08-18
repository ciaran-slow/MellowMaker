import {
  formatStepTimestamp,
  normalizeMakerNote,
  normalizeTranscriptExcerpt,
  parseStepTimestamp,
  validateGuideStepInstruction,
} from '@/domain/guides/guideStepDraft';

describe('validateGuideStepInstruction', () => {
  it('accepts a trimmed non-empty instruction', () => {
    expect(validateGuideStepInstruction('  Make a magic ring  ')).toStrictEqual({
      ok: true,
      value: 'Make a magic ring',
    });
  });

  it('rejects a blank or whitespace-only instruction', () => {
    expect(validateGuideStepInstruction('   ')).toStrictEqual({
      ok: false,
      message: 'Add an instruction for this step.',
    });
  });
});

describe('parseStepTimestamp', () => {
  it('treats a blank field as an accepted absent value', () => {
    expect(parseStepTimestamp('   ')).toStrictEqual({ ok: true, value: undefined });
  });

  it('parses M:SS to milliseconds', () => {
    // 0:42 is 42 seconds — 42000 ms, not 42 (a seconds-vs-ms bug) and not 4200.
    expect(parseStepTimestamp('0:42')).toStrictEqual({ ok: true, value: 42000 });
  });

  it('parses a minute rollover to milliseconds', () => {
    // 1:05 is 65 seconds; an mm-only or naive parse would land on 105000 or 1500.
    expect(parseStepTimestamp('1:05')).toStrictEqual({ ok: true, value: 65000 });
  });

  it('parses H:MM:SS to milliseconds', () => {
    expect(parseStepTimestamp('1:00:00')).toStrictEqual({
      ok: true,
      value: 3600000,
    });
  });

  it('parses bare seconds with no upper bound', () => {
    expect(parseStepTimestamp('75')).toStrictEqual({ ok: true, value: 75000 });
  });

  it('rejects an out-of-range seconds segment', () => {
    expect(parseStepTimestamp('1:99')).toStrictEqual({
      ok: false,
      message: 'Enter a time like 0:45 or 1:05:20.',
    });
  });

  it('rejects a non-numeric input', () => {
    expect(parseStepTimestamp('abc')).toStrictEqual({
      ok: false,
      message: 'Enter a time like 0:45 or 1:05:20.',
    });
  });

  it('rejects an out-of-range minutes segment in H:MM:SS', () => {
    expect(parseStepTimestamp('1:75:00').ok).toBe(false);
  });
});

describe('formatStepTimestamp', () => {
  it('formats sub-hour offsets as M:SS', () => {
    expect(formatStepTimestamp(42000)).toBe('0:42');
    expect(formatStepTimestamp(65000)).toBe('1:05');
  });

  it('formats an hour-or-more offset as H:MM:SS', () => {
    expect(formatStepTimestamp(3600000)).toBe('1:00:00');
  });

  it('round-trips with parseStepTimestamp', () => {
    const parsed = parseStepTimestamp('2:07');
    expect(parsed.ok && parsed.value).toBe(127000);
    expect(formatStepTimestamp(127000)).toBe('2:07');
  });
});

describe('optional text normalizers', () => {
  it('collapses a blank transcript excerpt to undefined', () => {
    expect(normalizeTranscriptExcerpt('   ')).toBeUndefined();
  });

  it('trims and keeps a non-empty note', () => {
    expect(normalizeMakerNote('  hi  ')).toBe('hi');
  });
});
