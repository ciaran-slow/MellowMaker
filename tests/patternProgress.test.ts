import {
  nextIncompleteStepId,
  resolvePatternProgressView,
} from '@/domain/patterns/patternProgress';

/**
 * Hand-authored fixtures: expected statuses and current step are written out
 * literally so a regression in the resolver — not a mirror of its own logic —
 * is what fails.
 */
const STEPS = [
  { id: 's0', instruction: 'Chain 20' },
  { id: 's1', instruction: 'Single crochet across' },
  { id: 's2', instruction: 'Turn and repeat' },
  { id: 's3', instruction: 'Fasten off' },
];

describe('resolvePatternProgressView', () => {
  it('marks the first incomplete step current when no active step is set', () => {
    const view = resolvePatternProgressView(STEPS, {
      activeStepId: undefined,
      completedStepIds: [],
    });

    expect(view.currentStepId).toBe('s0');
    expect(view.steps.map((step) => step.status)).toStrictEqual([
      'current',
      'todo',
      'todo',
      'todo',
    ]);
    expect(view.completedCount).toBe(0);
    expect(view.totalCount).toBe(4);
    expect(view.allComplete).toBe(false);
  });

  it('picks the first incomplete by list order even when steps were completed out of order', () => {
    // s2 then s0 completed: a "first-by-completion-time" bug would land on s3
    // (after s2) or otherwise not on s1. The first *incomplete by position* is s1.
    const view = resolvePatternProgressView(STEPS, {
      activeStepId: undefined,
      completedStepIds: ['s2', 's0'],
    });

    expect(view.currentStepId).toBe('s1');
    expect(view.steps.map((step) => step.status)).toStrictEqual([
      'completed',
      'current',
      'completed',
      'todo',
    ]);
    expect(view.completedCount).toBe(2);
    expect(view.allComplete).toBe(false);
  });

  it('honours an active step that is still incomplete', () => {
    const view = resolvePatternProgressView(STEPS, {
      activeStepId: 's2',
      completedStepIds: ['s0'],
    });

    expect(view.currentStepId).toBe('s2');
    expect(view.steps[2]?.status).toBe('current');
    // s1 is incomplete but not current, because the maker parked on s2.
    expect(view.steps[1]?.status).toBe('todo');
  });

  it('falls back to the first incomplete step when the active step is already completed', () => {
    const view = resolvePatternProgressView(STEPS, {
      activeStepId: 's1',
      completedStepIds: ['s0', 's1'],
    });

    expect(view.currentStepId).toBe('s2');
    expect(view.steps.map((step) => step.status)).toStrictEqual([
      'completed',
      'completed',
      'current',
      'todo',
    ]);
  });

  it('ignores an active step id that names no existing step', () => {
    const view = resolvePatternProgressView(STEPS, {
      activeStepId: 'ghost',
      completedStepIds: ['s0'],
    });

    expect(view.currentStepId).toBe('s1');
  });

  it('reports no current step and allComplete when every step is done', () => {
    const view = resolvePatternProgressView(STEPS, {
      activeStepId: 's3',
      completedStepIds: ['s0', 's1', 's2', 's3'],
    });

    expect(view.currentStepId).toBeUndefined();
    expect(view.completedCount).toBe(4);
    expect(view.allComplete).toBe(true);
    expect(view.steps.every((step) => step.status === 'completed')).toBe(true);
  });

  it('reports an empty pattern as no current step and zero counts', () => {
    const view = resolvePatternProgressView([], {
      activeStepId: undefined,
      completedStepIds: [],
    });

    expect(view.currentStepId).toBeUndefined();
    expect(view.steps).toStrictEqual([]);
    expect(view.totalCount).toBe(0);
    expect(view.completedCount).toBe(0);
    // No step exists, so the pattern is not "complete".
    expect(view.allComplete).toBe(false);
  });

  it('numbers each step by its 0-based list index', () => {
    const view = resolvePatternProgressView(STEPS, {
      activeStepId: undefined,
      completedStepIds: [],
    });

    expect(view.steps.map((step) => step.index)).toStrictEqual([0, 1, 2, 3]);
  });
});

describe('nextIncompleteStepId', () => {
  it('returns the first incomplete step in list order', () => {
    expect(nextIncompleteStepId(STEPS, ['s0', 's1'])).toBe('s2');
  });

  it('skips completed steps regardless of the order they were completed', () => {
    expect(nextIncompleteStepId(STEPS, ['s2', 's0'])).toBe('s1');
  });

  it('returns undefined when every step is complete', () => {
    expect(nextIncompleteStepId(STEPS, ['s0', 's1', 's2', 's3'])).toBeUndefined();
  });

  it('returns undefined for an empty step list', () => {
    expect(nextIncompleteStepId([], [])).toBeUndefined();
  });
});
