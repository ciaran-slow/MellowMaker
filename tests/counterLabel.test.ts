/** @jest-environment node */

import {
  DEFAULT_COUNTER_LABEL,
  MAX_COUNTER_LABEL_LENGTH,
  normalizeCounterLabel,
} from '@/domain/counters/counterLabel';

describe('normalizeCounterLabel', () => {
  it('trims surrounding whitespace but keeps interior spaces', () => {
    expect(normalizeCounterLabel('  Border rounds  ')).toBe('Border rounds');
  });

  it('falls back to the default label for blank or whitespace-only input', () => {
    // Pinned literal so a change to the default is a deliberate, visible edit.
    expect(DEFAULT_COUNTER_LABEL).toBe('Rows');
    expect(normalizeCounterLabel('')).toBe('Rows');
    expect(normalizeCounterLabel('   ')).toBe('Rows');
    expect(normalizeCounterLabel('\t\n')).toBe('Rows');
  });

  it('truncates an over-length label to exactly the maximum', () => {
    expect(MAX_COUNTER_LABEL_LENGTH).toBe(40);
    const longLabel = 'a'.repeat(50);

    const normalized = normalizeCounterLabel(longLabel);

    expect(normalized).toHaveLength(40);
    expect(normalized).toBe('a'.repeat(40));
  });
});
