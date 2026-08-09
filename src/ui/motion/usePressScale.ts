import type { ViewStyle } from 'react-native';
import type { AnimatedStyle } from 'react-native-reanimated';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import tokens from '@/ui/theme/tokens.json';

export interface PressScale {
  readonly animatedStyle: AnimatedStyle<ViewStyle>;
  onPressIn(): void;
  onPressOut(): void;
}

/**
 * The shared press-feedback scale. Under `useReducedMotion` the scale is never
 * animated at all, and no caller waits on the animation: press handling and
 * navigation stay synchronous.
 */
export function usePressScale(disabled = false): PressScale {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return {
    animatedStyle,
    onPressIn: () => {
      if (!reduceMotion && !disabled) {
        scale.set(
          withTiming(tokens.motion.pressScale, {
            duration: tokens.motion.timingMs,
          }),
        );
      }
    },
    onPressOut: () => {
      scale.set(
        reduceMotion
          ? 1
          : withSpring(1, {
              damping: tokens.motion.spring.damping,
              stiffness: tokens.motion.spring.stiffness,
            }),
      );
    },
  };
}
