import type { BottomTabBarButtonProps } from 'expo-router/tabs';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import tokens from '@/ui/theme/tokens.json';

type CraftTabBarButtonProps = Omit<BottomTabBarButtonProps, 'ref'>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function CraftTabBarButton({
  accessibilityRole,
  accessibilityState,
  children,
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: CraftTabBarButtonProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const isDisabled = disabled || accessibilityState?.disabled === true;
  const isSelected = accessibilityState?.selected === true;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      accessibilityRole={accessibilityRole ?? 'tab'}
      role="tab"
      accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={(event) => {
        if (!isDisabled) {
          onPress?.(event);
        }
      }}
      onPressIn={(event) => {
        onPressIn?.(event);
        if (!reduceMotion && !isDisabled) {
          scale.set(
            withTiming(tokens.motion.pressScale, {
              duration: tokens.motion.timingMs,
            }),
          );
        }
      }}
      onPressOut={(event) => {
        onPressOut?.(event);
        scale.set(
          reduceMotion
            ? 1
            : withSpring(1, {
                damping: tokens.motion.spring.damping,
                stiffness: tokens.motion.spring.stiffness,
              }),
        );
      }}
      style={[
        style,
        {
          minHeight: tokens.touch.minimum,
          minWidth: tokens.touch.minimum,
          borderTopColor: isSelected ? tokens.colors.pink : 'transparent',
          borderTopWidth: isSelected ? tokens.spacing[1] : 0,
          borderRadius: isSelected ? tokens.radii.medium : 0,
        },
        animatedStyle,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}
