import { renderHook } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { useStrokeDraw } from '@/ui/motion/useStrokeDraw';

/**
 * Issue #46 (AC2 / A11Y-06 / UX-04): the reduced-motion gate pinned at the layer
 * where it is implemented, following `usePressScale.test.tsx`. Every value is a
 * literal rather than read back from `tokens.motion`, so a token drift is caught
 * here rather than mirrored.
 *
 * The shared-value spy echoes the value the hook initialises it with, which is
 * what makes the *first painted frame* assertable: under reduced motion the
 * drawing must already be finished, not animate to finished.
 */
describe('useStrokeDraw', () => {
  let set: jest.Mock;

  beforeEach(() => {
    set = jest.fn();
    jest.spyOn(Reanimated, 'useSharedValue').mockImplementation(((
      initial: number,
    ) => ({
      value: initial,
      get: () => initial,
      set,
    })) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(false);
  });

  it('with motion allowed, the stroke starts fully undrawn and draws on after its delay', async () => {
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(false);
    const withTiming = jest.spyOn(Reanimated, 'withTiming');
    const withDelay = jest.spyOn(Reanimated, 'withDelay');

    const { result } = await renderHook(() => useStrokeDraw(148, 240));

    // The first frame hides the whole stroke, so the draw-on is visible from
    // its very beginning instead of starting part-way through.
    expect(result.current.animatedProps.strokeDashoffset).toBe(148);
    expect(withTiming).toHaveBeenCalledWith(0, { duration: 600 });
    expect(withDelay).toHaveBeenCalledWith(240, 0);
    expect(set).toHaveBeenLastCalledWith(0);
  });

  it('negative branch: under reduced motion the first frame is already the finished drawing', async () => {
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(true);
    const withTiming = jest.spyOn(Reanimated, 'withTiming');
    const withDelay = jest.spyOn(Reanimated, 'withDelay');

    const { result } = await renderHook(() => useStrokeDraw(148, 240));

    expect(result.current.animatedProps.strokeDashoffset).toBe(0);
    expect(withTiming).not.toHaveBeenCalled();
    expect(withDelay).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(0);
  });

  it('negative branch: reduced motion survives a re-render, so motion cannot leak back in', async () => {
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(true);
    const withTiming = jest.spyOn(Reanimated, 'withTiming');
    const withDelay = jest.spyOn(Reanimated, 'withDelay');

    const { result, rerender } = await renderHook(
      ({ length, delayMs }: { length: number; delayMs: number }) =>
        useStrokeDraw(length, delayMs),
      { initialProps: { length: 148, delayMs: 240 } },
    );

    await rerender({ length: 148, delayMs: 240 });

    expect(result.current.animatedProps.strokeDashoffset).toBe(0);
    expect(withTiming).not.toHaveBeenCalled();
    expect(withDelay).not.toHaveBeenCalled();
  });

  it('delays each step on its own, so a step-zero draw is never silently offset', async () => {
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(false);
    const withDelay = jest.spyOn(Reanimated, 'withDelay');

    await renderHook(() => useStrokeDraw(148, 0));

    expect(withDelay).toHaveBeenCalledWith(0, 0);
  });
});
