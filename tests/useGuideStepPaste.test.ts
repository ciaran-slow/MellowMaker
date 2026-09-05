import { act, renderHook } from '@testing-library/react-native';

import type { GuideStepAuthoringInput } from '@/data/contracts/guideRepository';
import { useGuideStepPaste } from '@/features/guides/presentation/useGuideStepPaste';

/**
 * Issue #50: the paste state machine's write guard, at the layer that implements
 * it. The screen tests pin what a maker can reach through the UI; this pins the
 * guard the UI relies on — `confirm` writes only from the review phase — which no
 * screen test can reach, because the confirm control is not rendered in the input
 * phase at all.
 */
describe('useGuideStepPaste', () => {
  const CHAPTERS = '0:00 Materials\n1:12 Magic ring';

  async function mount() {
    const append = jest.fn<void, [readonly GuideStepAuthoringInput[]]>();
    const { result } = await renderHook(() => useGuideStepPaste(append));

    return { append, result };
  }

  it('confirms nothing while still in the input phase', async () => {
    const { append, result } = await mount();

    expect(result.current.phase.kind).toBe('input');
    await act(async () => {
      result.current.confirm();
    });

    // A confirm outside review writes nothing and does not change phase.
    expect(append).not.toHaveBeenCalled();
    expect(result.current.phase.kind).toBe('input');
  });

  it('confirms nothing after a rejected paste', async () => {
    const { append, result } = await mount();

    await act(async () => {
      result.current.review('no timestamps here');
    });
    expect(result.current.phase).toStrictEqual({
      kind: 'input',
      error: 'no-timestamps',
    });

    await act(async () => {
      result.current.confirm();
    });
    expect(append).not.toHaveBeenCalled();
  });

  it('confirms exactly once from review, then returns to input', async () => {
    const { append, result } = await mount();

    await act(async () => {
      result.current.review(CHAPTERS);
    });
    // Reaching review writes nothing — this is the arm that keeps the two
    // no-op cases above from passing vacuously.
    expect(append).not.toHaveBeenCalled();
    expect(result.current.phase).toStrictEqual({
      kind: 'review',
      source: 'chapters',
      steps: [
        { instruction: 'Materials', videoOffsetMs: 0 },
        { instruction: 'Magic ring', videoOffsetMs: 72000 },
      ],
    });

    await act(async () => {
      result.current.confirm();
    });

    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith([
      { instruction: 'Materials', videoOffsetMs: 0 },
      { instruction: 'Magic ring', videoOffsetMs: 72000 },
    ]);
    expect(result.current.phase).toStrictEqual({ kind: 'input' });

    // A second confirm after returning to input writes nothing more, so a
    // double tap cannot append the same draft twice.
    await act(async () => {
      result.current.confirm();
    });
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('discards without writing and clears the review', async () => {
    const { append, result } = await mount();

    await act(async () => {
      result.current.review(CHAPTERS);
    });
    await act(async () => {
      result.current.discard();
    });

    expect(append).not.toHaveBeenCalled();
    expect(result.current.phase).toStrictEqual({ kind: 'input' });
  });
});
