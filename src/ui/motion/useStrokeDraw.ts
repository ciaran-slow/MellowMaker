import { useEffect } from 'react';
import {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import tokens from '@/ui/theme/tokens.json';

export interface StrokeDraw {
  /**
   * Fed to an animated `<Path>` as `animatedProps`. Reanimated types an
   * animated-prop object as `Partial`, so the shape is stated that way here
   * rather than re-asserted with a cast.
   */
  readonly animatedProps: Partial<{ strokeDashoffset: number }>;
}

/**
 * The shared stroke-draw primitive, sitting beside `usePressScale` and following
 * its shape: `useReducedMotion` decides the whole behaviour, and no caller ever
 * waits on the animation.
 *
 * The shared value is *initialised* to the finished drawing under reduced
 * motion, so the first painted frame is already the final frame — there is no
 * flash of an undrawn stroke and nothing is scheduled. With motion allowed the
 * stroke starts fully hidden (`strokeDashoffset === length`) and draws on after
 * its per-step delay.
 */
export function useStrokeDraw(length: number, delayMs: number): StrokeDraw {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(reduceMotion ? 0 : length);

  useEffect(() => {
    if (reduceMotion) {
      // No `withTiming`, no `withDelay`, no easing: the drawing is simply
      // finished. This also covers the preference flipping while mounted.
      offset.set(0);

      return;
    }

    offset.set(
      withDelay(delayMs, withTiming(0, { duration: tokens.motion.drawMs })),
    );
  }, [delayMs, length, offset, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
  }));

  return { animatedProps };
}
