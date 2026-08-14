/** @jest-environment node */

import {
  normalizePatternNotes,
  validatePatternTitle,
  validateStepInstruction,
} from '@/domain/patterns/patternDraft';

describe('pattern draft validation', () => {
  describe('validatePatternTitle', () => {
    it('accepts a non-empty title and returns it trimmed', () => {
      expect(validatePatternTitle('  Sunrise Blanket  ')).toStrictEqual({
        ok: true,
        value: 'Sunrise Blanket',
      });
    });

    it('rejects an empty or whitespace-only title with a message', () => {
      expect(validatePatternTitle('').ok).toBe(false);
      const blank = validatePatternTitle('   ');
      expect(blank.ok).toBe(false);
      if (!blank.ok) {
        expect(blank.message.length).toBeGreaterThan(0);
      }
    });

    it('preserves inner punctuation and LIKE metacharacters literally', () => {
      expect(validatePatternTitle('100% wool _ cotton')).toStrictEqual({
        ok: true,
        value: '100% wool _ cotton',
      });
    });
  });

  describe('validateStepInstruction', () => {
    it('accepts a non-empty instruction and returns it trimmed', () => {
      expect(validateStepInstruction('  Chain 41  ')).toStrictEqual({
        ok: true,
        value: 'Chain 41',
      });
    });

    it('rejects an empty or whitespace-only instruction with a message', () => {
      expect(validateStepInstruction('').ok).toBe(false);
      const blank = validateStepInstruction('   ');
      expect(blank.ok).toBe(false);
      if (!blank.ok) {
        expect(blank.message.length).toBeGreaterThan(0);
      }
    });

    it('keeps inner newlines and punctuation intact', () => {
      expect(validateStepInstruction('Single crochet\nacross, then turn')).toStrictEqual(
        {
          ok: true,
          value: 'Single crochet\nacross, then turn',
        },
      );
    });
  });

  describe('normalizePatternNotes', () => {
    it('returns undefined for blank or whitespace-only notes', () => {
      expect(normalizePatternNotes('')).toBeUndefined();
      expect(normalizePatternNotes('   ')).toBeUndefined();
    });

    it('returns the trimmed notes otherwise', () => {
      expect(normalizePatternNotes('  Hook 5.0 mm  ')).toBe('Hook 5.0 mm');
    });
  });
});
