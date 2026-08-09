/** @jest-environment node */

import { normalizeStitchQuery } from '@/domain/stitches/stitchQuery';

describe('normalizeStitchQuery', () => {
  it('trims, lowercases, and collapses internal whitespace runs', () => {
    expect(normalizeStitchQuery('  Single  \t Crochet \n ')).toBe(
      'single crochet',
    );
  });

  it('reports whitespace-only input as blank so it restores browse', () => {
    expect(normalizeStitchQuery('')).toBe('');
    expect(normalizeStitchQuery('   \t\n ')).toBe('');
  });

  it('preserves LIKE metacharacters instead of stripping them', () => {
    // Stripping them here would silently turn a search for a literal per-cent
    // sign into a search for everything once the SQL boundary saw it.
    expect(normalizeStitchQuery('  100%_A\\B  ')).toBe('100%_a\\b');
  });
});
